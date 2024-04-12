"use strict";

const { join, normalize, dirname, relative } = require("path");
const { has, getImportPrefixToAlias, getProjectRootOptions, getFallbackProjectRoot, getLanguageConfig } = require("./utils");

/**
 * @param {string} absolutePath
 * @param {string} baseUrl
 * @param {Record<string, string>} importPrefixToAlias
 * @param {boolean} onlyPathAliases
 * @param {boolean} onlyAbsoluteImports
 * @returns {string | undefined}
 */
function getExpectedPath(absolutePath, baseUrl, importPrefixToAlias, onlyPathAliases, onlyAbsoluteImports) {
    const relativeToBasePath = relative(baseUrl, absolutePath);
    if (!onlyAbsoluteImports) {
        for (let prefix of Object.keys(importPrefixToAlias)) {
            const aliasPath = importPrefixToAlias[prefix];
            // assuming they are either a full path or a path ends with /*, which are the two standard cases
            const importPrefix = prefix.endsWith("/*") ? prefix.replace("/*", "") : prefix;
            const aliasImport = aliasPath.endsWith("/*") ? aliasPath.replace("/*", "") : aliasPath;
            if (relativeToBasePath.startsWith(importPrefix)) {
                return `${aliasImport}${relativeToBasePath.slice(importPrefix.length)}`;
            }
        }
    }
    if (!onlyPathAliases) {
        return relativeToBasePath;
    }
}

/**
 * @param {Readonly<import("@typescript-eslint/utils/ts-eslint").RuleContext<string, readonly unknown[]>>} context
 * @param {(path: string) => boolean} importPathConditionCallback
 * @returns {import("@typescript-eslint/utils/ts-eslint").RuleListener}
 */
function generateRule(context, importPathConditionCallback) {
    /** @type any */
    const options = context.options[0] || {};
    const onlyPathAliases = options.onlyPathAliases || false;
    const onlyAbsoluteImports = options.onlyAbsoluteImports || false;

    const filename = context.filename ?? context.getFilename();

    const settings = context.settings["absolute-imports"];
    /** @type {string[]} */
    let projectRootOptions = [];
    if (typeof settings === "object" && settings !== null && "projectRoot" in settings) {
        projectRootOptions = getProjectRootOptions(settings.projectRoot);
    } else {
        const fallbackProjectRoot = getFallbackProjectRoot(dirname(filename));
        if (fallbackProjectRoot) {
            projectRootOptions = [fallbackProjectRoot];
        }
    }

    const langConfig = getLanguageConfig(projectRootOptions, filename);
    if (!langConfig) {
        return {};
    }

    let baseUrl = undefined;
    if (langConfig && has(langConfig[1], "compilerOptions.baseUrl")) {
        baseUrl = join(langConfig[0], langConfig[1].compilerOptions.baseUrl);
    }
    if (!baseUrl) {
        return {};
    }

    /** @type {Record<string, string[]>} */
    let paths = {};
    if (langConfig && has(langConfig[1], "compilerOptions.paths")) {
        const configPaths = langConfig[1].compilerOptions.paths;
        if (typeof configPaths === "object") {
            for (const key of Object.keys(configPaths)) {
                if (Array.isArray(configPaths[key])) {
                    paths[key] = [];
                    for (const configPath of configPaths[key]) {
                        if (typeof configPath === "string") {
                            paths[key].push(configPath);
                        }
                    }
                }
            }
        }
    }
    const importPrefixToAlias = getImportPrefixToAlias(paths);

    return {
        ImportDeclaration(node) {
            const actualPath = node.source.value;
            if (importPathConditionCallback(actualPath)) {
                const absolutePath = normalize(
                    join(dirname(filename), actualPath)
                );
                const expectedPath = getExpectedPath(
                    absolutePath,
                    baseUrl,
                    importPrefixToAlias,
                    onlyPathAliases,
                    onlyAbsoluteImports,
                );

                if (expectedPath && actualPath !== expectedPath) {
                    context.report({
                        node,
                        data: { expectedPath, actualPath: actualPath },
                        messageId: "relativeImport",
                        fix: function(fixer) {
                            return fixer.replaceText(node.source, `'${expectedPath}'`);
                        },
                    });
                }
            }
        },
    };
}

const optionsSchema = {
    type: 'object',
    properties: {
        onlyPathAliases: {
            type: 'boolean',
        },
        onlyAbsoluteImports: {
            type: 'boolean',
        },
    }
}

module.exports.rules = {
    "no-relative-imports": /** @type {import("@typescript-eslint/utils").TSESLint.AnyRuleModule} */({
        meta: {
            fixable: "code",
            messages: {
                "relativeImport": "Relative imports are not allowed. Use \`{{expectedPath}}\` instead of \`{{actualPath}}\`.",
            },
            type: "problem",
            schema: [optionsSchema]
        },
        defaultOptions: [],
        create: function(context) {
            return generateRule(
                context,
                source => source.startsWith(".")
            );
        }
    }),
    "no-relative-parent-imports": /** @type {import("@typescript-eslint/utils").TSESLint.AnyRuleModule} */({
        meta: {
            fixable: "code",
            messages: {
                "relativeImport": "Relative imports from parent directories are not allowed. Use \`{{expectedPath}}\` instead of \`{{actualPath}}\`.",
            },
            type: "problem",
            schema: [optionsSchema]
        },
        defaultOptions: [],
        create: function(context) {
            return generateRule(
                context,
                source => source.startsWith("..")
            );
        }
    }),
};
