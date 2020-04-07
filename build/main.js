"use strict";
/*
 * Created with @iobroker/create-adapter v1.23.0
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const request = require("request-promise-native");
class Sunnyportal extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'sunnyportal' }));
        this.URL = 'https://sunnyportal.com';
        this.LOGIN_URL = '/Templates/Start.aspx';
        this.OPEN_INVERTER_URL = '/FixedPages/InverterSelection.aspx';
        this.SET_FILE_DATE_URL = '/FixedPages/InverterSelection.aspx';
        this.CURRENT_PRODUCTION_URL = '/Dashboard';
        this.DOWNLOAD_RESULTS_URL = '/Templates/DownloadDiagram.aspx?down=diag';
        this.email = '';
        this.password = '';
        this.plantOID = '';
        this.viewState = '';
        this.viewStateGenerator = '';
        this.timer = null;
        this.jar = request.jar();
        this.defaultRequestOps = {
            jar: this.jar,
            resolveWithFullResponse: true,
        };
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            // Initialize your adapter here
            this.email = this.config.sunnyPortalEmail;
            this.password = this.config.sunnyPortalPassword;
            this.log.info('starting...');
            yield this.login(this.fetchData);
            this.log.info('done...');
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            callback.bind(this)();
        }
        catch (e) {
            callback.bind(this)();
        }
    }
    login(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.info('starting login...');
            try {
                // Let's first fetch the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter values
                request.get(this.URL + this.LOGIN_URL, this.defaultRequestOps, (err, httpResponse, body) => {
                    console.log('Cookie Value: ' + this.jar.getCookieString(this.URL));
                    // Filter out both values for the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter
                    this.viewState = body.match(/<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="(.*)" \/>/)[1];
                    this.viewStateGenerator = body.match(/<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="(.*)" \/>/)[1];
                    console.log('Fetched VIEWSTATE value: ' + this.viewState);
                    console.log('Fetched VIEWSTATEGENERATOR value: ' + this.viewStateGenerator);
                    const requestOpts = Object.assign(Object.assign({}, this.defaultRequestOps), { headers: {
                            // We need to simulate a Browser which the SunnyPortal accepts...here I am Using Firefox 71.0 (64-bit) for Windows
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:71.0) Gecko/20100101 Firefox/71.0',
                        }, form: {
                            __VIEWSTATE: this.viewState,
                            __VIEWSTATEGENERATOR: this.viewStateGenerator,
                            ctl00$ContentPlaceHolder1$Logincontrol1$txtUserName: this.email,
                            ctl00$ContentPlaceHolder1$Logincontrol1$txtPassword: this.password,
                            ctl00$ContentPlaceHolder1$Logincontrol1$LoginBtn: 'Login',
                        } });
                    // Now Let's login by Posting the data
                    request.post(this.URL + this.LOGIN_URL + '?ReturnURl=%2f', requestOpts, (err, httpResponse, body) => {
                        if (err) {
                            console.error('login failed:', err);
                            return;
                        }
                        // Hack to check for login. Should forward to dashboard.
                        if (httpResponse.headers.location) { // && httpResponse.headers.location == '/FixedPages/Dashboard.aspx') {
                            console.log('SUCCESSFULLY LOGGED IN');
                            callback.bind(this)();
                        }
                        else {
                            console.log('Login Failed, no redirect to Dashboard');
                        }
                    });
                });
            }
            catch (error) {
                this.log.error('login failed, retrying in 5 sec: ' + error);
                setTimeout(this.login.bind(this), 5 * 1000);
            }
        });
    }
    fetchData() {
        console.log('Fetching data...');
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
        request.get(this.URL + this.CURRENT_PRODUCTION_URL + '?_=' + n, this.defaultRequestOps, (err, httpResponse, body) => {
            if (err) {
                console.error('Could not get current production');
            }
            console.log(JSON.parse(body));
            let obj;
            try {
                obj = JSON.parse(body);
            }
            catch (error) {
                this.log.error('error in JSON!');
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
                this.timer = setInterval(this.fetchData.bind(this), 15 * 1000);
            }
        });
    }
    setAttribute(name, value, type = 'number') {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.setObjectNotExistsAsync(name, {
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
            yield this.setStateAsync(name, { val: value, ack: true });
        });
    }
    reset() {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        setTimeout(this.login.bind(this), 5 * 1000);
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new Sunnyportal(options);
}
else {
    // otherwise start the instance directly
    (() => new Sunnyportal())();
}
