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
const axios_1 = require("axios");
class Sunnyportal extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'sunnyportal' }));
        this.url = 'https://sunnyportal.com';
        this.timer = 0;
        this.email = '';
        this.password = '';
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
            this.login(this.fetchData);
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        callback.bind(this);
        try {
            this.log.info('cleaned everything up...');
            callback();
        }
        catch (e) {
            callback();
        }
    }
    login(callback) {
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
        const api = axios_1.default.create(requestOpts);
        api.post(this.url + LOGIN_URL, requestOpts)
            .then((response) => {
            this.log.info("login succeeded");
            callback();
            return;
        })
            .catch((error) => {
            this.log.error('login failed, retrying in 5 sec: ' + error);
            setTimeout(this.login, 5 * 1000);
            return;
        });
    }
    fetchData() {
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
        const api = axios_1.default.create(requestOpts);
        api.get(this.url + HOMEMANAGER_URL + '?t=' + n)
            .then((response) => {
            this.log.info("data fetched...");
            try {
                var obj = JSON.parse(response.data);
            }
            catch (error) {
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
            .catch((error) => {
            this.log.error('request failed:' + error);
            this.reset();
            return;
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
                native: {}
            });
            yield this.setStateAsync(name, { val: value, ack: true });
        });
    }
    reset() {
        if (this.timer != 0) {
            clearInterval(this.timer);
            this.timer = 0;
        }
        setTimeout(setup, 5 * 1000);
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
