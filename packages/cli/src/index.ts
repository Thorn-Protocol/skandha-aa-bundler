#!/usr/bin/env node

// MUST import first to apply preset from args
import { YargsError } from "./util";
import { getSkandhaCli, yarg } from "./cli";

console.log("set auto clear console every 24 hours");
setInterval(() => {
    console.clear();
}, 3 * 60 * 60 * 1000);

const bundler = getSkandhaCli();
void bundler
    .fail((msg, err) => {
        if (msg) {
            if (msg.includes("Not enough non-option arguments")) {
                yarg.showHelp();
                // eslint-disable-next-line no-console
                console.log("\n");
            }
        }

        const errorMessage = err !== undefined ? (err instanceof YargsError ? err.message : err.stack) : msg || "Unknown Error";

        // eslint-disable-next-line no-console
        console.error(` ✖ ${errorMessage}\n`);
        process.exit(1);
    })
    .parse();
