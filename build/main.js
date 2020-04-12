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
const options_1 = require("./options");
const sunnyPortalService_1 = require("./sunnyPortalService");
const timers_1 = require("timers");
class Sunnyportal extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'sunnyportal' }));
        this.URL = 'https://sunnyportal.com';
        this.liveDataInterval = null;
        this.dailyDataInterval = null;
        this.monthlyDataInterval = null;
        this.yearlyDataInterval = null;
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            // Initialize your adapter here
            const ops = new options_1.Options(this.log, 60 * 1000, // every 1 minutes
            this.URL, this.config.sunnyPortalEmail, this.config.sunnyPortalPassword);
            this.startup(ops);
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.info('Cleaned everything up...');
            this.liveDataInterval && clearInterval(this.liveDataInterval);
            this.dailyDataInterval && clearInterval(this.dailyDataInterval);
            this.monthlyDataInterval && clearInterval(this.monthlyDataInterval);
            this.yearlyDataInterval && clearInterval(this.yearlyDataInterval);
            callback.bind(this)();
        }
        catch (e) {
            callback.bind(this)();
        }
    }
    startup(ops) {
        const sunnyPortalService = new sunnyPortalService_1.SunnyPortalService(ops);
        this.fetchData(sunnyPortalService);
        this.liveDataInterval = timers_1.setInterval(() => {
            this.fetchData(sunnyPortalService);
        }, ops.updateInterval);
    }
    fetchData(sunnyPortalService) {
        // const now = new Date();
        // const month = now.getMonth() + 1;
        // const day = now.getDate();
        // const year = now.getFullYear();
        //
        // sunnyPortalService.historicalProduction(DateType.DAY, year, month, day, (err, data) => {
        //     this.log.info('Daily data');
        //     this.log.info(data);
        // });
        //
        // sunnyPortalService.historicalProduction(DateType.MONTH, year, month, day, (err, data) => {
        //     this.log.info('Monthly data');
        //     this.log.info(data);
        // });
        //
        // sunnyPortalService.historicalProduction(DateType.YEAR, year, month, day, (err, data) => {
        //     this.log.info('Yearly data');
        //     this.log.info(data);
        // });
        sunnyPortalService.currentProduction((err, data) => {
            if (err) {
                this.log.error(err);
                return;
            }
            this.processLiveData(data);
        });
    }
    processLiveData(responseData) {
        const wantedData = [
            { name: 'PV', unit: 'W' },
            { name: 'FeedIn', unit: 'W' },
            { name: 'GridConsumption', unit: 'W' },
            { name: 'DirectConsumption', unit: 'W' },
            { name: 'SelfConsumption', unit: 'W' },
            { name: 'SelfSupply', unit: 'W' },
            { name: 'TotalConsumption', unit: 'W' },
            { name: 'DirectConsumptionQuote', unit: '%' },
            { name: 'SelfConsumptionQuote', unit: '%' },
            { name: 'AutarkyQuote', unit: '%' },
            { name: 'BatteryIn', unit: 'W' },
            { name: 'BatteryOut', unit: 'W' },
            { name: 'BatteryChargeStatus', unit: '%' },
        ];
        for (const key of Object.keys(responseData)) {
            const data = responseData[key];
            const wanted = wantedData.filter((wanted) => wanted.name == key);
            if (wanted.length === 1 && data) {
                this.setAttribute(wanted[0].name, data, wanted[0].unit, 'current');
            }
        }
        if (responseData['Timestamp']) {
            this.setAttribute('Timestamp', responseData['Timestamp']['DateTime'], '', 'current', 'string');
        }
    }
    setAttribute(name, value, unit, folderName = '', type = 'number') {
        return __awaiter(this, void 0, void 0, function* () {
            let nameWithPrefix = name;
            if (folderName)
                nameWithPrefix = folderName + '.' + name;
            yield this.setObjectNotExistsAsync(nameWithPrefix, {
                type: 'state',
                common: {
                    name: name,
                    type: type,
                    role: 'value',
                    read: true,
                    write: false,
                    unit: unit,
                },
                native: {},
            });
            yield this.setStateAsync(nameWithPrefix, { val: value, ack: true });
        });
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
