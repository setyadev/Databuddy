import { randomUUIDv7 } from "bun";
import { z } from "zod";

const schema = z.object({
    uuid7: z.uuidv7(),
});
function benchmark(count: number) {
    const start = Date.now();
    const uuid7 = randomUUIDv7();
    let i = 0;

    while (i < count) {
        z.safeParse(schema, uuid7);
        i += 1;
    }
    const end = Date.now();
    const time = (start - end)
    console.log(start - e);
}

benchmark(10_000);
