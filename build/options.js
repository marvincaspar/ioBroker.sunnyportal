"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Options {
    constructor(logger, updateInterval, url, username, password) {
        this.logger = logger;
        this.updateInterval = updateInterval;
        this.url = url;
        this.username = username;
        this.password = password;
    }
}
exports.Options = Options;
