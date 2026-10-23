import {ApiProblemError} from '../api/problem.js';

export const maxImagesPerSite = 1000;

export function problem(code: string, status = 409): never {
    throw new ApiProblemError(status, code, code.replace(/_/g, ' '));
}

export function contentIds(value): number[] {
    if (!Array.isArray(value) || !value.length || value.length > maxImagesPerSite
        || new Set(value).size !== value.length || value.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        problem('image_optimization_ids_invalid', 400);
    }
    return value;
}

export function requestKey(value): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
        problem('image_optimization_key_invalid', 400);
    }
    return value;
}

