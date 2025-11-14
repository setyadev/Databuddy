import pino from "pino";

const token = process.env.AXIOM_TOKEN as string;
const dataset = process.env.AXIOM_DATASET as string;
let transport: any

if (token && dataset) {
    transport = {
        target: "@axiomhq/pino",
        options: {
            token,
            dataset,
        },
    };
} else {
    transport = {
        options: {
            colorize: true,
        },
    };
}

export const logger = pino({
    level: "debug",
    name: "databuddy",
    transport
});


export function createLogger(name: string) {
    return pino({
        level: "debug",
        name,
        transport
    });
}