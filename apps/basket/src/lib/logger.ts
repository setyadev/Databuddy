// import { logger as sharedLogger } from "@databuddy/shared/logger";

// export const logger = sharedLogger.child({
// 	service: "basket",
// });

import pino from "pino";

export const logger = pino({
	level: "debug",
	name: "basket",
});