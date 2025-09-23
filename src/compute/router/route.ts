import type { RouteAction } from './routeAction.js';

export type Not<T> = { not: T };
export type Value = string | RegExp;
export type ArrayValue = Value | Array<Value> | Not<Value | Array<Value>>;
export type MapValue = Record<string, Value>;

export interface RouteCondition {
    url?: ArrayValue;
    path?: ArrayValue;
    pathExtension?: ArrayValue;
    method?: ArrayValue;
    cookie?: MapValue;
    header?: MapValue;
    query?: MapValue;
}

export interface Route {
    condition?: RouteCondition;
    actions?: RouteAction[];
    done?: boolean;
}

export function isRoute(route: any): route is Route {
    return route && typeof route === 'object' && 'condition' in route && 'actions' in route;
}

export function isRouteCondition(condition: any): condition is RouteCondition {
    return (
        condition &&
        typeof condition === 'object' &&
        ('url' in condition || 'path' in condition || 'method' in condition || 'cookie' in condition || 'header' in condition || 'query' in condition)
    );
}

export function isValue(value: any): value is Value {
    return typeof value === 'string' || value instanceof RegExp || (typeof value === 'object' && 'not' in value);
}

export function isArrayValue(value: any): value is ArrayValue {
    return typeof value === 'string' || value instanceof RegExp || Array.isArray(value) || (typeof value === 'object' && 'not' in value);
}

export function isMapValue(value: any): value is MapValue {
    return typeof value === 'object' && Object.values(value).every(isValue);
}

export function isNot(value: any): value is Not<string | RegExp> {
    return typeof value === 'object' && 'not' in value;
}
