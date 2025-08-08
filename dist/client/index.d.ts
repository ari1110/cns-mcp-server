#!/usr/bin/env node
/**
 * CNS MCP Client - Communicates with CNS MCP Server
 * Used by thin hook wrappers
 */
export declare class CNSClient {
    private client;
    private transport;
    constructor();
    connect(): Promise<void>;
    callTool(toolName: string, args: any): Promise<import("zod").objectOutputType<{
        _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
    } & {
        content: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodUnion<[import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"text">;
            text: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{
            type: import("zod").ZodLiteral<"text">;
            text: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{
            type: import("zod").ZodLiteral<"text">;
            text: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"image">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{
            type: import("zod").ZodLiteral<"image">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{
            type: import("zod").ZodLiteral<"image">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"audio">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{
            type: import("zod").ZodLiteral<"audio">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{
            type: import("zod").ZodLiteral<"audio">;
            data: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            mimeType: import("zod").ZodString;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<import("zod").objectUtil.extendShape<import("zod").objectUtil.extendShape<{
            name: import("zod").ZodString;
            title: import("zod").ZodOptional<import("zod").ZodString>;
        }, {
            uri: import("zod").ZodString;
            description: import("zod").ZodOptional<import("zod").ZodString>;
            mimeType: import("zod").ZodOptional<import("zod").ZodString>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }>, {
            type: import("zod").ZodLiteral<"resource_link">;
        }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<import("zod").objectUtil.extendShape<{
            name: import("zod").ZodString;
            title: import("zod").ZodOptional<import("zod").ZodString>;
        }, {
            uri: import("zod").ZodString;
            description: import("zod").ZodOptional<import("zod").ZodString>;
            mimeType: import("zod").ZodOptional<import("zod").ZodString>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }>, {
            type: import("zod").ZodLiteral<"resource_link">;
        }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<import("zod").objectUtil.extendShape<{
            name: import("zod").ZodString;
            title: import("zod").ZodOptional<import("zod").ZodString>;
        }, {
            uri: import("zod").ZodString;
            description: import("zod").ZodOptional<import("zod").ZodString>;
            mimeType: import("zod").ZodOptional<import("zod").ZodString>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }>, {
            type: import("zod").ZodLiteral<"resource_link">;
        }>, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<{
            type: import("zod").ZodLiteral<"resource">;
            resource: import("zod").ZodUnion<[import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">>]>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{
            type: import("zod").ZodLiteral<"resource">;
            resource: import("zod").ZodUnion<[import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">>]>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{
            type: import("zod").ZodLiteral<"resource">;
            resource: import("zod").ZodUnion<[import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                text: import("zod").ZodString;
            }>, import("zod").ZodTypeAny, "passthrough">>, import("zod").ZodObject<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<import("zod").objectUtil.extendShape<{
                uri: import("zod").ZodString;
                mimeType: import("zod").ZodOptional<import("zod").ZodString>;
                _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
            }, {
                blob: import("zod").ZodEffects<import("zod").ZodString, string, string>;
            }>, import("zod").ZodTypeAny, "passthrough">>]>;
            _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        }, import("zod").ZodTypeAny, "passthrough">>]>, "many">>;
        structuredContent: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
        isError: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod").ZodTypeAny, "passthrough"> | import("zod").objectOutputType<{
        _meta: import("zod").ZodOptional<import("zod").ZodObject<{}, "passthrough", import("zod").ZodTypeAny, import("zod").objectOutputType<{}, import("zod").ZodTypeAny, "passthrough">, import("zod").objectInputType<{}, import("zod").ZodTypeAny, "passthrough">>>;
    } & {
        toolResult: import("zod").ZodUnknown;
    }, import("zod").ZodTypeAny, "passthrough">>;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map