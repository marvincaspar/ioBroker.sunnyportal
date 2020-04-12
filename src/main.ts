/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { Options } from './options';
import { SunnyPortalService } from './sunnyPortalService';
import { setInterval } from 'timers';

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

    private liveDataInterval: any = null;
    private dailyDataInterval: any = null;
    private monthlyDataInterval: any = null;
    private yearlyDataInterval: any = null;

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
        const ops = new Options(
            this.log,
            300 * 1000, // every 5 minutes
            this.URL,
            this.config.sunnyPortalEmail,
            this.config.sunnyPortalPassword,
        );

        this.startup(ops);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.info('Cleaned everything up...');
            this.liveDataInterval && clearInterval(this.liveDataInterval);
            this.dailyDataInterval && clearInterval(this.dailyDataInterval);
            this.monthlyDataInterval && clearInterval(this.monthlyDataInterval);
            this.yearlyDataInterval && clearInterval(this.yearlyDataInterval);
            callback.bind(this)();
        } catch (e) {
            callback.bind(this)();
        }
    }

    private startup(ops: Options): void {
        const sunnyPortalService = new SunnyPortalService(ops);

        this.fetchData(sunnyPortalService);
        this.liveDataInterval = setInterval(() => {
            this.fetchData(sunnyPortalService);
        }, ops.updateInterval);
    }

    private fetchData(sunnyPortalService: SunnyPortalService) {
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
            this.processLiveData(data);
        });
    }

    private processLiveData(responseData: any): void {
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

    private async setAttribute(
        name: string,
        value: any,
        unit: string,
        folderName = '',
        type = 'number',
    ): Promise<void> {
        let nameWithPrefix = name;
        if (folderName) nameWithPrefix = folderName + '.' + name;

        await this.setObjectNotExistsAsync(nameWithPrefix, {
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

        await this.setStateAsync(nameWithPrefix, { val: value, ack: true });
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new Sunnyportal(options);
} else {
    // otherwise start the instance directly
    (() => new Sunnyportal())();
}
