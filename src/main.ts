/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import * as request from 'request-promise-native';

// Augment the adapter.config object with the actual types
// TODO: delete this in the next version
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ioBroker {
        interface AdapterConfig {
            // Define the shape of your options here (recommended)
            sunnyPortalEmail: string;
            sunnyPortalPassword: string;
        }
    }
}

class Sunnyportal extends utils.Adapter {
    readonly URL = 'https://sunnyportal.com';
    readonly LOGIN_URL = '/Templates/Start.aspx';
    readonly OPEN_INVERTER_URL = '/FixedPages/InverterSelection.aspx';
    readonly SET_FILE_DATE_URL = '/FixedPages/InverterSelection.aspx';
    readonly CURRENT_PRODUCTION_URL = '/Dashboard';
    readonly DOWNLOAD_RESULTS_URL = '/Templates/DownloadDiagram.aspx?down=diag';

    private email = '';
    private password = '';
    private plantOID = '';
    private viewState = '';
    private viewStateGenerator = '';

    private timer: any = null;
    private loginTimer: any = null;

    private jar = request.jar();
    private defaultRequestOps = {
        jar: this.jar,
        resolveWithFullResponse: true,
        simple: false,
    };

    public constructor(options: Partial<ioBroker.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'sunnyportal',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here
        this.email = this.config.sunnyPortalEmail;
        this.password = this.config.sunnyPortalPassword;

        await this.login(this.fetchLiveData);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.info('Cleaned everything up...');
            clearInterval(this.timer);
            this.timer = null;
            clearTimeout(this.loginTimer);
            this.loginTimer = null;
            callback.bind(this)();
        } catch (e) {
            callback.bind(this)();
        }
    }

    private async login(callback: () => void): Promise<void> {
        // Let's first fetch the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter values
        request
            .get(this.URL + this.LOGIN_URL, this.defaultRequestOps)
            .then((response) => {
                this.log.debug('Cookie Value: ' + this.jar.getCookieString(this.URL));
                // Filter out both values for the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter
                this.viewState = response.body.match(
                    /<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="(.*)" \/>/,
                )[1];
                this.viewStateGenerator = response.body.match(
                    /<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="(.*)" \/>/,
                )[1];
                this.log.debug('Fetched VIEWSTATE value: ' + this.viewState);
                this.log.debug('Fetched VIEWSTATEGENERATOR value: ' + this.viewStateGenerator);

                const requestOpts = {
                    ...this.defaultRequestOps,
                    headers: {
                        // We need to simulate a Browser which the SunnyPortal accepts...here I am Using Firefox 71.0 (64-bit) for Windows
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:71.0) Gecko/20100101 Firefox/71.0',
                    },
                    form: {
                        __VIEWSTATE: this.viewState,
                        __VIEWSTATEGENERATOR: this.viewStateGenerator,
                        ctl00$ContentPlaceHolder1$Logincontrol1$txtUserName: this.email,
                        ctl00$ContentPlaceHolder1$Logincontrol1$txtPassword: this.password,
                        ctl00$ContentPlaceHolder1$Logincontrol1$LoginBtn: 'Login',
                    },
                };

                // Now let's login by Posting the data
                request
                    .post(this.URL + this.LOGIN_URL + '?ReturnURl=%2f', requestOpts)
                    .then((response) => {
                        // Hack to check for login. Should forward to next page.
                        if (
                            response.headers.location &&
                            (response.headers.location == '/FixedPages/HoManLive.aspx' ||
                                response.headers.location == '/FixedPages/Dashboard.aspx')
                        ) {
                            this.log.info('Successfully logged in');
                            callback.bind(this)();
                        } else {
                            this.log.warn('Login Failed, no redirect!');
                            this.reset.bind(this)();
                        }
                    })
                    .catch((err) => {
                        this.log.error(err);
                        this.reset.bind(this)();
                    });
            })
            .catch((err) => {
                this.log.error(err);
                this.reset.bind(this)();
            });
    }

    private fetchLiveData(): void {
        const d = new Date();
        const n = d.getTime();

        const wantedData = [
            'PV',
            'FeedIn',
            'GridConsumption',
            'DirectConsumption',
            'SelfConsumption',
            'SelfSupply',
            'TotalConsumption',
            'DirectConsumptionQuote',
            'SelfConsumptionQuote',
            'AutarkyQuote',
            'BatteryIn',
            'BatteryOut',
            'BatteryChargeStatus',
        ];
        request
            .get(this.URL + this.CURRENT_PRODUCTION_URL + '?_=' + n, this.defaultRequestOps)
            .then((response) => {
                if (response.err) {
                    this.log.error('Could not get current production');
                    this.reset.bind(this)();
                    return;
                }
                this.log.debug(JSON.parse(response.body));
                let obj;
                try {
                    obj = JSON.parse(response.body);
                } catch (error) {
                    this.log.error('Error in JSON!');
                    this.reset.bind(this)();
                    return;
                }

                for (const key of Object.keys(obj)) {
                    const data = obj[key];
                    if (wantedData.includes(key)) {
                        this.setAttribute(key, data);
                    }
                }
                this.setAttribute('Timestamp', obj['Timestamp']['DateTime'], 'string');
                if (this.timer == null) {
                    // Fetch data every minute
                    this.timer = setInterval(this.fetchLiveData.bind(this), 60 * 1000);
                }
            })
            .catch((err) => {
                this.log.error(err);
                this.reset.bind(this)();
            });
    }

    private async setAttribute(name: string, value: any, type = 'number'): Promise<void> {
        await this.setObjectNotExistsAsync(name, {
            type: 'state',
            common: {
                name: name,
                type: type,
                role: 'value',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setStateAsync(name, { val: value, ack: true });
    }

    private reset(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.loginTimer = setTimeout(this.login.bind(this), 5 * 1000);
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new Sunnyportal(options);
} else {
    // otherwise start the instance directly
    (() => new Sunnyportal())();
}
