import { chQuery } from "@databuddy/db";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { QueryRequest, SimpleQueryConfig } from "./types";
import { applyPlugins } from "./utils";

type BatchRequest = QueryRequest & { type: string };
type BatchResult = { type: string; data: Record<string, unknown>[]; error?: string };
type BatchOptions = { websiteDomain?: string | null; timezone?: string };

function getSchemaSignature(config: SimpleQueryConfig): string | null {
    const fields = config.meta?.output_fields;
    return fields?.length ? fields.map((f) => `${f.name}:${f.type}`).join(",") : null;
}

async function runSingle(req: BatchRequest, opts?: BatchOptions): Promise<BatchResult> {
    const config = QueryBuilders[req.type];
    if (!config) {
        return { type: req.type, data: [], error: `Unknown query type: ${req.type}` };
    }

    try {
        const builder = new SimpleQueryBuilder(
            config,
            { ...req, timezone: opts?.timezone ?? req.timezone },
            opts?.websiteDomain
        );
        return { type: req.type, data: await builder.execute() };
    } catch (e) {
        return { type: req.type, data: [], error: e instanceof Error ? e.message : "Query failed" };
    }
}

function groupBySchema(requests: BatchRequest[]): Map<string, BatchRequest[]> {
    const groups = new Map<string, BatchRequest[]>();

    for (const req of requests) {
        const config = QueryBuilders[req.type];
        if (!config) {
            continue;
        }

        const sig = getSchemaSignature(config) || `__solo_${req.type}`;
        const list = groups.get(sig) || [];
        list.push(req);
        groups.set(sig, list);
    }

    return groups;
}

function buildUnionQuery(requests: BatchRequest[], opts?: BatchOptions) {
    const queries: string[] = [];
    const params: Record<string, unknown> = {};
    const types: string[] = [];

    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        if (!req) {
            continue;
        }

        const config = QueryBuilders[req.type];
        if (!config) {
            continue;
        }

        const builder = new SimpleQueryBuilder(
            config,
            { ...req, timezone: opts?.timezone ?? req.timezone },
            opts?.websiteDomain
        );

        let { sql, params: queryParams } = builder.compile();

        for (const [key, value] of Object.entries(queryParams)) {
            const prefixedKey = `q${i}_${key}`;
            params[prefixedKey] = value;
            sql = sql.replaceAll(`{${key}:`, `{${prefixedKey}:`);
        }

        types.push(req.type);
        queries.push(`SELECT '${req.type}' as __query_type, * FROM (${sql})`);
    }

    return { sql: queries.join("\nUNION ALL\n"), params, types };
}

function splitResults(
    rows: Array<Record<string, unknown> & { __query_type: string }>,
    types: string[]
): Map<string, Record<string, unknown>[]> {
    const byType = new Map<string, Record<string, unknown>[]>(types.map((t) => [t, []]));

    for (const { __query_type, ...rest } of rows) {
        byType.get(__query_type)?.push(rest);
    }

    return byType;
}

export async function executeBatch(requests: BatchRequest[], opts?: BatchOptions): Promise<BatchResult[]> {
    if (requests.length === 0) {
        return [];
    }
    if (requests.length === 1 && requests[0]) {
        return [await runSingle(requests[0], opts)];
    }

    const groups = groupBySchema(requests);
    const results: BatchResult[] = [];

    for (const groupReqs of groups.values()) {
        if (groupReqs.length === 0) {
            continue;
        }

        if (groupReqs.length === 1 && groupReqs[0]) {
            results.push(await runSingle(groupReqs[0], opts));
            continue;
        }

        try {
            const { sql, params, types } = buildUnionQuery(groupReqs, opts);
            const rawRows = await chQuery(sql, params);
            const split = splitResults(rawRows as Array<Record<string, unknown> & { __query_type: string }>, types);

            for (const type of types) {
                const config = QueryBuilders[type];
                const raw = split.get(type) || [];
                results.push({
                    type,
                    data: config ? applyPlugins(raw, config, opts?.websiteDomain) : raw,
                });
            }
        } catch {
            for (const req of groupReqs) {
                results.push(await runSingle(req, opts));
            }
        }
    }

    const resultMap = new Map(results.map((r) => [r.type, r]));
    return requests.map((req) => resultMap.get(req.type) || { type: req.type, data: [] });
}

export function areQueriesCompatible(type1: string, type2: string): boolean {
    const [c1, c2] = [QueryBuilders[type1], QueryBuilders[type2]];
    if (!(c1 && c2)) {
        return false;
    }
    const [s1, s2] = [getSchemaSignature(c1), getSchemaSignature(c2)];
    return Boolean(s1 && s2 && s1 === s2);
}

export function getCompatibleQueries(type: string): string[] {
    const config = QueryBuilders[type];
    const sig = config ? getSchemaSignature(config) : null;
    if (!sig) {
        return [];
    }

    return Object.entries(QueryBuilders)
        .filter(([t, c]) => t !== type && getSchemaSignature(c) === sig)
        .map(([t]) => t);
}

export function getSchemaGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const [type, config] of Object.entries(QueryBuilders)) {
        const sig = getSchemaSignature(config);
        if (!sig) {
            continue;
        }
        const list = groups.get(sig) || [];
        list.push(type);
        groups.set(sig, list);
    }

    return groups;
}
