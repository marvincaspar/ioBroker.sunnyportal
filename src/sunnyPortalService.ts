import { Options } from './options';
import * as request from 'request';
import { DateType } from './dateType';

export class SunnyPortalService {
    readonly logger: ioBroker.Logger;
    readonly url: string;
    readonly username: string;
    readonly password: string;
    private plantOID = '';

    private jar: request.CookieJar;

    readonly LOGIN_URL = '/Templates/Start.aspx';
    readonly OPEN_INVERTER_URL = '/FixedPages/InverterSelection.aspx';
    readonly SET_FILE_DATE_URL = '/FixedPages/InverterSelection.aspx';
    readonly CURRENT_PRODUCTION_URL = '/Dashboard?_=1';
    readonly DOWNLOAD_RESULTS_URL = '/Templates/DownloadDiagram.aspx?down=diag';

    constructor(private ops: Options) {
        this.logger = ops.logger;
        this.url = ops.url;
        this.username = ops.username;
        this.password = ops.password;
        this.jar = request.jar();
    }

    public currentProduction(callback: (err: any, body?: any) => void): void {
        this.login((err: any, jar: request.CookieJar) => {
            if (err) {
                callback(err);
                return;
            }

            const requestOpts = {
                method: 'GET',
                jar: jar,
            };

            // The timestamp is just ignored. Using 1.
            request(this.url + this.CURRENT_PRODUCTION_URL, requestOpts, (err, httpResponse, body) => {
                if (err) {
                    this.logger.error('Could not get current production');
                    callback(err);
                }
                callback(err, JSON.parse(body));
            });
        });
    }

    public historicalProduction(
        dateType: DateType,
        year: number,
        month: number,
        day: number,
        callback: (err: any, response: any) => void,
    ): void {
        // Due to app dependencies, you cannot just download the document.
        // You need to crawl the application such that items get added to your session.
        // Then you may download the days data.
        //
        // You could make this more efficient by not logging in everytime but... I just wanted something quick and dirty.
        let finalJar: request.CookieJar;

        const downloadResultCallback = (err: any, body: any): void => {
            const response: any = [[]];
            const power = [];
            const times = [];
            let date;
            const lineItems = body.split('\n');

            for (const lineItem of lineItems) {
                const entries = lineItem.split(';');
                if (entries[0] && entries[1]) {
                    if (dateType == DateType.DAY) {
                        const ampm = entries[0].split(' ')[1];
                        const time = entries[0].split(' ')[0];
                        let hour = parseInt(time.split(':')[0]);
                        const minute = parseInt(time.split(':')[1]);

                        if (ampm == 'PM' && hour < 12) {
                            hour += 12;
                        }
                        if (ampm == 'AM' && hour == 12) {
                            hour = 0;
                        }

                        //We need to substract 1 from the month because in Javascript: January=0 in Sunnyportal: January=1;
                        date = new Date(year, month - 1, day, hour, minute);
                        // If set to midnight the next day, add another day. Their response is messed up
                        if (hour == 0 && minute == 0) {
                            date.setDate(date.getDate() + 1);
                        }
                    } else if (dateType == DateType.MONTH) {
                        const d = entries[0].split('/')[1];
                        // I'm only interested in the day value...we are going to use the parameter value for month and year
                        date = new Date(year, month - 1, d, 12, 0); // Using ISO Format
                    } else if (dateType == DateType.YEAR) {
                        const m = entries[0].split(' ')[0];
                        // Because only the last 2 digits of the year are returned we are going to use the year parameter value...
                        // we could prepend the returned value with 20...but then the script will fail in the next century ;)
                        const months = [
                            'Jan',
                            'Feb',
                            'Mar',
                            'Apr',
                            'May',
                            'Jun',
                            'Jul',
                            'Aug',
                            'Sep',
                            'Oct',
                            'Nov',
                            'Dec',
                        ];
                        date = new Date(year, months.indexOf(m), 1, 12, 0);
                    }
                    // Add the date results to the array
                    times.push(date);
                    // Add the power results to the array
                    power.push(isNaN(parseFloat(entries[1])) ? 0 : parseFloat(entries[1]));
                }
            }
            response[0] = times;
            response[1] = power;
            callback(err, response);
        };

        const setFileDateCallback = (): void => {
            this.downloadResults(finalJar, downloadResultCallback);
        };

        const openInverterCallback = (): void => {
            this.setFileDate(dateType, year, month, day, finalJar, setFileDateCallback);
        };

        const loginCallback = (err: any, jar: request.CookieJar): void => {
            finalJar = jar;
            this.openInverter(finalJar, openInverterCallback);
        };

        this.login(loginCallback);
    }

    private login(callback: (err: any, obj?: any) => void): void {
        this.jar = request.jar(); // create new cookie jar
        let viewState = null;
        let viewStateGenerator = null;

        let requestOpts: any = {
            jar: this.jar,
        };

        // Let's first fetch the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter values
        request.get(this.url + this.LOGIN_URL, requestOpts, (err, httpResponse, body) => {
            if (err) {
                this.logger.error('Unable to fetch login page: ' + err);
                callback(err);
                return;
            }
            this.logger.debug('Cookie Value: ' + this.jar.getCookieString(this.url));
            // Filter out both values for the VIEWSTATE & VIEWSTATEGENERATOR hidden parameter
            viewState = body.match(/<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="(.*)" \/>/)[1];
            viewStateGenerator = body.match(
                /<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="(.*)" \/>/,
            )[1];
            this.logger.debug('Fetched VIEWSTATE value: ' + viewState);
            this.logger.debug('Fetched VIEWSTATEGENERATOR value: ' + viewStateGenerator);

            requestOpts = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:71.0) Gecko/20100101 Firefox/71.0',
                },
                form: {
                    __VIEWSTATE: viewState,
                    __VIEWSTATEGENERATOR: viewStateGenerator,
                    ctl00$ContentPlaceHolder1$Logincontrol1$txtUserName: this.username,
                    ctl00$ContentPlaceHolder1$Logincontrol1$txtPassword: this.password,
                    ctl00$ContentPlaceHolder1$Logincontrol1$LoginBtn: 'Login',
                },
                jar: this.jar,
            };

            // Now Let's login by Posting the data
            request.post(this.url + this.LOGIN_URL + '?ReturnURl=%2f', requestOpts, (err, httpResponse) => {
                if (err) {
                    this.logger.error('login failed:' + err);
                    callback(err);
                    return;
                }

                // Hack to check for login. Should forward to dashboard.
                if (httpResponse.headers.location) {
                    this.logger.debug('SUCCESSFULLY LOGGED IN');
                    callback(err, this.jar);
                } else {
                    this.logger.warn('Login Failed, no redirect to Dashboard');
                    callback(new Error('Login Failed, no redirect to Dashboard'));
                }
            });
        });
    }

    private openInverter(jar: request.CookieJar, callback: (err: any, body?: any) => void): void {
        const requestOpts = {
            method: 'GET',
            jar: jar,
        };

        request(this.url + this.OPEN_INVERTER_URL, requestOpts, (err, httpResponse, body) => {
            this.logger.debug('HTTP Result: ' + httpResponse.statusCode);
            // Filter out value for the ctl00_HiddenPlantOID hidden parameter
            this.plantOID = body.match(
                /<input type="hidden" name="ctl00\$HiddenPlantOID" id="ctl00_HiddenPlantOID" value="(.*)" \/>/,
            )[1];
            this.logger.debug('Fetched ctl00_HiddenPlantOID value: ' + this.plantOID);
            if (err) {
                this.logger.error('Could not open inverter');
                callback(err);
            }
            callback(err, body);
        });
    }

    private setFileDate(
        dateType: DateType,
        year: number,
        month: number,
        day: number,
        jar: request.CookieJar,
        callback: (err?: any, body?: any) => void,
    ): void {
        const requestOpts: any = {
            headers: {
                // We need to simulate a Browser which the SunnyPortal accepts...here I am Using Firefox 71.0 (64-bit) for Windows
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:71.0) Gecko/20100101 Firefox/71.0',
            },
            form: {
                __EVENTTARGET: '',
                __EVENTARGUMENT: '',
                ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$DeviceSelection$HiddenPlantOID: this
                    .plantOID,
                ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$UseIntervalHour: '0',
                ctl00$HiddenPlantOID: this.plantOID,
            },
            jar: jar,
        };
        // Depending on the dateType we are going to add the necessary hidden parameters to the form
        if (dateType == DateType.DAY) {
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$SelectedIntervalID'] = '3';
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$_datePicker$textBox'] =
                month + '/' + day + '/' + year;
        } else if (dateType == DateType.MONTH) {
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$SelectedIntervalID'] = '4';
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$DatePickerMonth'] = month;
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$DatePickerYear'] = year;
        } else if (dateType == DateType.YEAR) {
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$SelectedIntervalID'] = '5';
            requestOpts.form['ctl00$ContentPlaceHolder1$UserControlShowInverterSelection1$DatePickerYear'] = year;
        }

        // If the dateType is day and the provided date is the current date, we may not post the SET_FILE_DATE_URL
        const now = new Date();
        if (
            dateType == DateType.DAY &&
            day == now.getDate() &&
            month == now.getMonth() + 1 &&
            year == now.getFullYear()
        ) {
            this.logger.debug('Skip setting date because we are requesting power data from today');
            callback();
        }

        request.post(this.url + this.SET_FILE_DATE_URL, requestOpts, (err, httpResponse, body) => {
            this.logger.debug('HTTP Result: ' + httpResponse.statusCode);
            if (err) {
                this.logger.error('Setting File Date failed:' + err);
                callback(err);
                return;
            }

            callback(err, body);
        });
    }

    private downloadResults(jar: request.CookieJar, callback: (err: any, body?: any) => void): void {
        const requestOpts = {
            method: 'GET',
            jar: jar,
        };

        request(this.url + this.DOWNLOAD_RESULTS_URL, requestOpts, (err, httpResponse, body) => {
            this.logger.debug('HTTP Result: ' + httpResponse.statusCode);
            if (err) {
                this.logger.error('CSV download failed:' + err);
                callback(err);
                return;
            }

            callback(err, body);
        });
    }
}
