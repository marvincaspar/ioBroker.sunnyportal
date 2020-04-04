/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import axios, { AxiosError, AxiosResponse } from "axios";

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
    readonly url = 'https://sunnyportal.com';
    private timer: any = 0;

    private email: string = '';
    private password: string = '';

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

        this.log.info('starting...');

        this.login(this.fetchData);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        callback.bind(this);
        try {
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    private login(callback: () => void) {
        callback.bind(this);
        var LOGIN_URL = '/Templates/Start.aspx';

        var requestOpts = {
            headers: {
                'SunnyPortalPageCounter': 0,
                'Origin': this.url,
                'Referer': ' https://www.sunnyportal.com/Templates/Start.aspx',
                "DNT": 1,
                'Content-Type': "application/x-www-form-urlencoded",
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36'
            },
            form: {
                __EVENTTARGET: '',
                __EVENTARGUMENT: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$LoginBtn: 'Anmelden',
                ctl00$ContentPlaceHolder1$Logincontrol1$txtPassword: this.password,
                ctl00$ContentPlaceHolder1$Logincontrol1$txtUserName: this.email,
                ctl00$ContentPlaceHolder1$Logincontrol1$ServiceAccess: 'true',
                ctl00$ContentPlaceHolder1$Logincontrol1$RedirectURL: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$RedirectPlant: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$RedirectPage: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$RedirectDevice: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$RedirectOther: '',
                ctl00$ContentPlaceHolder1$Logincontrol1$PlantIdentifier: '',
            },
            // Service does not have a valid cert
            strictSSL: false,
        };

        const api = axios.create(requestOpts);

        api.post(this.url + LOGIN_URL, requestOpts)
            .then((response: AxiosResponse<any>) => {
                this.log.info("login succeeded")
                callback();
                return;
            })
            .catch((error: AxiosError) => {
                this.log.error('login failed, retrying in 5 sec: ' + error);
                setTimeout(this.login, 5 * 1000);
                return;
            });
    }

    private fetchData() {
        this.log.info("fetching data...");
        const HOMEMANAGER_URL = '/homemanager';
        const requestOpts = {
            headers: {
                'Referer': 'https://www.sunnyportal.com/FixedPages/HoManLive.aspx',
                "DNT": 1,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            // Service does not have a valid cert
            strictSSL: false
        };

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

        const api = axios.create(requestOpts);

        api.get(this.url + HOMEMANAGER_URL + '?t=' + n)
            .then((response: AxiosResponse<any>) => {
                this.log.info("data fetched...");
                try {
                    var obj = JSON.parse(response.data);
                } catch (error) {
                    this.log.error('error in JSON!');
                    this.reset();
                    return;
                }

                this.log.debug(JSON.stringify(obj));

                for (let key of Object.keys(obj)) {
                    let data = obj[key];
                    if (wantedData.includes(key)) {
                        this.setAttribute(key, data);
                    }
                }
                this.setAttribute('Timestampt', obj['Timestamp']['DateTime'], "string");

                if (this.timer == 0) {
                    this.timer = setInterval(this.fetchData, 15 * 1000);
                }
            })
            .catch((error: AxiosError) => {
                this.log.error('request failed:' + error);
                this.reset();
                return;
            });
    }

    private async setAttribute(name: string, value: any, type: string = 'number') {
        await this.setObjectNotExistsAsync(name, {
            type: 'state',
            common: {
                name: name,
                type: type,
                role: 'value',
                read: true,
                write: false,
            },
            native: {}
        });

        await this.setStateAsync(name, { val: value, ack: true });
    }

    private reset() {
        if (this.timer != 0) {
            clearInterval(this.timer);
            this.timer = 0;
        }
        setTimeout(setup, 5 * 1000);
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new Sunnyportal(options);
} else {
    // otherwise start the instance directly
    (() => new Sunnyportal())();
}
