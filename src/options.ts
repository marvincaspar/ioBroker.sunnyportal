export class Options {
    readonly logger: ioBroker.Logger;
    readonly updateInterval: number;
    readonly url: string;
    readonly username: string;
    readonly password: string;

    constructor(logger: ioBroker.Logger, updateInterval: number, url: string, username: string, password: string) {
        this.logger = logger;
        this.updateInterval = updateInterval;
        this.url = url;
        this.username = username;
        this.password = password;
    }
}
