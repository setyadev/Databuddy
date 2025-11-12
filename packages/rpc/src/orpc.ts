import { auth, type User } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { os as createOS, ORPCError } from "@orpc/server";

export const createRPCContext = async (opts: { headers: Headers }) => {
    const session = await auth.api.getSession({
        headers: opts.headers,
    });

    return {
        db,
        auth,
        session: session?.session,
        user: session?.user as User | undefined,
        ...opts,
    };
};

export type Context = Awaited<ReturnType<typeof createRPCContext>>;

const os = createOS.$context<Context>();

export const publicProcedure = os;

export const protectedProcedure = os.use(({ context, next }) => {
    if (!(context.user && context.session)) {
        throw new ORPCError("UNAUTHORIZED");
    }

    return next({
        context: {
            ...context,
            session: context.session,
            user: context.user,
        },
    });
});

export const adminProcedure = protectedProcedure.use(({ context, next }) => {
    if (context.user.role !== "ADMIN") {
        throw new ORPCError("FORBIDDEN", {
            message: "You do not have permission to access this resource",
        });
    }

    return next({
        context: {
            ...context,
            session: context.session,
            user: context.user,
        },
    });
});

export { os };
