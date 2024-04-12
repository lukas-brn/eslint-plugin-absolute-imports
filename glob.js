const { existsSync, statSync, readdirSync } = require("fs");
const { resolve, join } = require("path");

/**
 * @param {string} glob
 * @param {string} [pwd]
 * @returns {string[]}
 */
function resolveGlobToPaths(glob, pwd) {
    const segments = glob.split("/");
    if (pwd !== undefined && !existsSync(pwd)) {
        return [];
    }
    let resolvedPaths = [pwd ?? resolve()];

    for (const segment of segments) {
        if (segment === "*") {
            resolvedPaths = resolveGlobStarSegmentToPaths(resolvedPaths);
        } else if (segment === "**") {
            resolvedPaths = resolveGlobDoubleStarSegmentToPaths(resolvedPaths);
        } else {
            resolvedPaths = resolveGlobSimpleSegmentToPaths(resolvedPaths, segment);
        }
    }

    return resolvedPaths;
}

/**
 * @param {string[]} resolvedPaths
 * @param {string} segment
 * @returns {string[]}
 */
function resolveGlobSimpleSegmentToPaths(resolvedPaths, segment) {
    const newPaths = [];
    for (const resolvedPath of resolvedPaths) {
        const newPath = join(resolvedPath, segment);
        if (existsSync(newPath)) {
            newPaths.push(newPath);
        }
    }
    return newPaths;
}

/**
 * @param {string[]} resolvedPaths
 * @returns {string[]}
 */
function resolveGlobStarSegmentToPaths(resolvedPaths) {
    const newPaths = [];
    for (const resolvedPath of resolvedPaths) {
        if (!statSync(resolvedPath).isDirectory()) {
            continue;
        }

        const dirEntries = readdirSync(resolvedPath);
        for (const dirEntry of dirEntries) {
            newPaths.push(join(resolvedPath, dirEntry));
        }
    }
    return newPaths;
}

/**
 * @param {string[]} resolvedPaths
 * @returns {string[]}
 */
function resolveGlobDoubleStarSegmentToPaths(resolvedPaths) {
    const newPaths = [...resolvedPaths];
    for (const resolvedPath of resolvedPaths) {
        if (!statSync(resolvedPath).isDirectory()) {
            continue;
        }

        const dirEntries = readdirSync(resolvedPath);
        for (const dirEntry of dirEntries) {
            const newPath = join(resolvedPath, dirEntry);
            newPaths.push(newPath, ...resolveGlobStarSegmentToPaths([newPath]));
        }
    }
    return newPaths;
}

module.exports = { resolveGlobToPaths };
