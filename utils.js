"use strict";

const { existsSync, readFileSync } = require("fs");
const {
    delimiter,
    relative,
    sep,
    join,
    parse,
    resolve,
    dirname,
} = require("path");
const { resolveGlobToPaths } = require("./glob");
const { parse: parseJsonC, printParseErrorCode } = require("jsonc-parser");

/**
 * @param {object} map
 * @param {string} path
 * @returns {boolean}
 */
function has(map, path) {
    /** @type unknown */
    let inner = map;
    for (let step of path.split(".")) {
        if (typeof inner === "object" && inner !== null && step in inner) {
            inner = inner[/** @type keyof typeof inner */ (step)];
            if (inner === undefined) {
                return false;
            }
        } else {
            return false;
        }
    }
    return true;
}

/**
 * @template {string} K
 * @template {string} V
 * @param {Record<K, V[]>} paths
 * @returns {Record<V, K>}
 */
function getImportPrefixToAlias(paths) {
    const reversed = /** @type {Record<V, K>} */ ({});
    for (let key of /** @type {(keyof typeof paths)[]} */ (
        Object.keys(paths)
    )) {
        for (let path of paths[key]) {
            reversed[path] = key;
        }
    }
    return reversed;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
    return typeof value === "string";
}

/** @type {Record<string, string[] | undefined>} */
const baseUrlCache = {};

/**
 * @param {unknown} projectConfig
 * @returns {string[]}
 */
function getProjectRootOptions(projectConfig) {
    /** @type string[] */
    let projectGlobs = [];
    if (Array.isArray(projectConfig)) {
        projectGlobs = projectConfig.filter(isString);
    } else if (typeof projectConfig === "string") {
        projectGlobs = [projectConfig];
    }

    const cacheKey = projectGlobs.join(delimiter);
    const cacheEntry = baseUrlCache[cacheKey];
    if (cacheEntry !== undefined) {
        return cacheEntry;
    }

    const res = projectGlobs.flatMap((glob) => resolveGlobToPaths(glob));
    baseUrlCache[cacheKey] = res;
    return res;
}

/**
 * @param {string} filename
 * @returns {string | undefined}
 */
function getFallbackProjectRoot(filename) {
    const root = parse(resolve()).root;
    let dir = filename;

    while (dir !== root) {
        if (existsSync(join(dir, "package.json"))) {
            return dir;
        }
        dir = dirname(dir);
    }
}

/**
 * @param {string} path1
 * @param {string} path2
 * @returns {number}
 */
function getCommonPathSegmentCount(path1, path2) {
    const relativePath = relative(path1, path2);
    const pathToParent = ".." + sep;

    let segmentCount = path1.split("/").length;
    let index = relativePath.indexOf(pathToParent, 0);

    while (index !== -1) {
        segmentCount--;
        index = relativePath.indexOf(pathToParent, index + 3);
    }

    return segmentCount;
}

/**
 * @typedef {{
 *  configFilePath: string,
 *  errors: (Omit<import("jsonc-parser").ParseError, "error"> & {
 *      error: ReturnType<typeof printParseErrorCode>
 *  })[]
 * }} GetLanguageConfigError
 */

/**
 * @param {string[]} baseDirOptions
 * @param {string} filename
 * @returns {[string, any] | GetLanguageConfigError | undefined} [ProjectRootPath, LanguageConfig]
 */
function getLanguageConfig(baseDirOptions, filename) {
    let bestMatchCommonPathSegmentCount = 0;
    /** @type [string, any] | undefined */
    let bestMatch = undefined;

    for (const baseDir of baseDirOptions) {
        const commonPathSegmentCount = getCommonPathSegmentCount(
            baseDir,
            filename,
        );
        if (commonPathSegmentCount <= bestMatchCommonPathSegmentCount) {
            continue;
        }

        const configFileNames = ["tsconfig.json", "jsconfig.json"];

        for (const configFileName of configFileNames) {
            const configFilePath = join(baseDir, configFileName);
            if (existsSync(configFilePath)) {
                const rawContent = readFileSync(configFilePath).toString();

                /** @type {import("jsonc-parser").ParseError[]} */
                const parseErrors = [];
                const configContent = parseJsonC(rawContent, parseErrors, {
                    disallowComments: false,
                    allowTrailingComma: true,
                    allowEmptyContent: true,
                });

                if (parseErrors.length > 0) {
                    // NOTE: this error output to the user as an error with some description
                    return {
                        configFilePath,
                        errors: parseErrors.map((e) => ({
                            ...e,
                            error: printParseErrorCode(e.error),
                        })),
                    };
                }

                bestMatch = [baseDir, configContent];
                bestMatchCommonPathSegmentCount = commonPathSegmentCount;
            }
        }
    }

    return bestMatch;
}

module.exports = {
    has,
    getImportPrefixToAlias,
    getProjectRootOptions,
    getFallbackProjectRoot,
    getLanguageConfig,
};
