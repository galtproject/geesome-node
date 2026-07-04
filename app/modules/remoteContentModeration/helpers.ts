export enum RemoteContentModerationMode {
	AutoImport = 'autoImport',
	ReviewFirst = 'reviewFirst'
}

export enum RemoteContentModerationAction {
	Allow = 'allow',
	Review = 'review',
	Quarantine = 'quarantine',
	Block = 'block'
}

export enum RemoteContentModerationRuleType {
	Keyword = 'keyword',
	Regex = 'regex'
}

export enum RemoteContentModerationRuleField {
	Text = 'text',
	Source = 'source',
	GroupName = 'groupName'
}

export interface IRemoteContentModerationPolicyInput {
	mode?: string | null;
	rules?: any[] | null;
}

export interface IRemoteContentModerationRule {
	name: string;
	type: RemoteContentModerationRuleType;
	field: RemoteContentModerationRuleField;
	value: string;
	action: RemoteContentModerationAction;
	regex?: RegExp;
}

export interface IRemoteContentModerationPolicy {
	mode: RemoteContentModerationMode;
	rules: IRemoteContentModerationRule[];
}

export interface IRemoteContentModerationTarget {
	text?: string | null;
	source?: string | string[] | null;
	groupName?: string | null;
}

export interface IRemoteContentModerationMatch {
	name: string;
	type: RemoteContentModerationRuleType;
	field: RemoteContentModerationRuleField;
	action: RemoteContentModerationAction;
}

export interface IRemoteContentModerationDecision {
	action: RemoteContentModerationAction;
	mode: RemoteContentModerationMode;
	matches: IRemoteContentModerationMatch[];
}

export interface IRemoteContentModerationSummary {
	allowed: number;
	review: number;
	quarantined: number;
	blocked: number;
	matches: number;
}

const remoteContentModerationDefaultPolicy: IRemoteContentModerationPolicy = {
	mode: RemoteContentModerationMode.AutoImport,
	rules: []
};
const remoteContentModerationMaxRules = 50;
const remoteContentModerationMaxRuleNameLength = 100;
const remoteContentModerationMaxRuleValueLength = 200;
const remoteContentModerationMaxTargetLength = 5000;

export function normalizeRemoteContentModerationPolicy(input: IRemoteContentModerationPolicyInput | null | undefined): IRemoteContentModerationPolicy {
	if (!input) {
		return {...remoteContentModerationDefaultPolicy};
	}
	return {
		mode: normalizeRemoteContentModerationMode(input.mode),
		rules: getArrayValues(input.rules)
			.slice(0, remoteContentModerationMaxRules)
			.map(rule => normalizeRemoteContentModerationRule(rule))
	};
}

export function evaluateRemoteContentModerationPolicy(
	input: IRemoteContentModerationPolicyInput | IRemoteContentModerationPolicy | null | undefined,
	target: IRemoteContentModerationTarget
): IRemoteContentModerationDecision {
	const policy = normalizeRemoteContentModerationPolicy(input);
	const matches = policy.rules
		.filter(rule => doesRemoteContentModerationRuleMatch(rule, target))
		.map(rule => getRemoteContentModerationMatch(rule));
	return {
		action: getRemoteContentModerationAction(policy.mode, matches),
		mode: policy.mode,
		matches
	};
}

export function getRemoteContentModerationSummary(decisions: IRemoteContentModerationDecision[]): IRemoteContentModerationSummary {
	return decisions.reduce((summary, decision) => {
		if (decision.action === RemoteContentModerationAction.Allow) {
			summary.allowed += 1;
		}
		if (decision.action === RemoteContentModerationAction.Review) {
			summary.review += 1;
		}
		if (decision.action === RemoteContentModerationAction.Quarantine) {
			summary.quarantined += 1;
		}
		if (decision.action === RemoteContentModerationAction.Block) {
			summary.blocked += 1;
		}
		summary.matches += decision.matches.length;
		return summary;
	}, {
		allowed: 0,
		review: 0,
		quarantined: 0,
		blocked: 0,
		matches: 0
	});
}

export function isRemoteContentModerationDecisionImportable(decision: IRemoteContentModerationDecision): boolean {
	return decision.action === RemoteContentModerationAction.Allow;
}

function normalizeRemoteContentModerationRule(rule): IRemoteContentModerationRule {
	const normalizedRule = {
		name: getRemoteContentModerationRuleName(rule),
		type: getRemoteContentModerationRuleType(rule?.type),
		field: getRemoteContentModerationRuleField(rule?.field),
		value: getRemoteContentModerationRuleValue(rule),
		action: getRemoteContentModerationRuleAction(rule?.action)
	};
	if (normalizedRule.type === RemoteContentModerationRuleType.Regex) {
		Object.defineProperty(normalizedRule, 'regex', {
			value: new RegExp(normalizedRule.value, 'i'),
			enumerable: false
		});
	}
	return normalizedRule;
}

function getRemoteContentModerationRuleName(rule): string {
	const name = getOptionalBoundedString(rule?.name, remoteContentModerationMaxRuleNameLength);
	if (name) {
		return name;
	}
	return getRemoteContentModerationRuleValue(rule);
}

function getRemoteContentModerationRuleValue(rule): string {
	const value = getOptionalBoundedString(rule?.value, remoteContentModerationMaxRuleValueLength);
	if (!value) {
		throw new Error('remote_content_moderation_rule_value_required');
	}
	if (getRemoteContentModerationRuleType(rule?.type) === RemoteContentModerationRuleType.Regex) {
		assertSafeRemoteContentRegex(value);
	}
	return value;
}

function normalizeRemoteContentModerationMode(value): RemoteContentModerationMode {
	if (value === undefined || value === null || value === '') {
		return RemoteContentModerationMode.AutoImport;
	}
	const mode = String(value).trim();
	if (['autoImport', 'auto-import', 'auto_import', 'auto'].includes(mode)) {
		return RemoteContentModerationMode.AutoImport;
	}
	if (['reviewFirst', 'review-first', 'review_first', 'review'].includes(mode)) {
		return RemoteContentModerationMode.ReviewFirst;
	}
	throw new Error('remote_content_moderation_mode_invalid');
}

function getRemoteContentModerationRuleType(value): RemoteContentModerationRuleType {
	if (value === undefined || value === null || value === '') {
		return RemoteContentModerationRuleType.Keyword;
	}
	if (value === RemoteContentModerationRuleType.Keyword || value === RemoteContentModerationRuleType.Regex) {
		return value;
	}
	throw new Error('remote_content_moderation_rule_type_invalid');
}

function getRemoteContentModerationRuleField(value): RemoteContentModerationRuleField {
	if (value === undefined || value === null || value === '') {
		return RemoteContentModerationRuleField.Text;
	}
	if (Object.values(RemoteContentModerationRuleField).includes(value)) {
		return value;
	}
	throw new Error('remote_content_moderation_rule_field_invalid');
}

function getRemoteContentModerationRuleAction(value): RemoteContentModerationAction {
	if (value === undefined || value === null || value === '') {
		return RemoteContentModerationAction.Block;
	}
	if (
		value === RemoteContentModerationAction.Block ||
		value === RemoteContentModerationAction.Quarantine ||
		value === RemoteContentModerationAction.Review
	) {
		return value;
	}
	throw new Error('remote_content_moderation_rule_action_invalid');
}

function doesRemoteContentModerationRuleMatch(rule: IRemoteContentModerationRule, target: IRemoteContentModerationTarget): boolean {
	const value = getTargetValue(rule.field, target);
	if (!value) {
		return false;
	}
	if (rule.type === RemoteContentModerationRuleType.Regex) {
		return (rule.regex || new RegExp(rule.value, 'i')).test(value);
	}
	return value.toLowerCase().includes(rule.value.toLowerCase());
}

function getTargetValue(field: RemoteContentModerationRuleField, target: IRemoteContentModerationTarget): string {
	if (field === RemoteContentModerationRuleField.Source) {
		return getBoundedTargetValue(target.source);
	}
	if (field === RemoteContentModerationRuleField.GroupName) {
		return getBoundedTargetValue(target.groupName);
	}
	return getBoundedTargetValue(target.text);
}

function getBoundedTargetValue(value: string | string[] | null | undefined): string {
	if (Array.isArray(value)) {
		return value.map(item => String(item || '')).join(' ').slice(0, remoteContentModerationMaxTargetLength);
	}
	return String(value || '').slice(0, remoteContentModerationMaxTargetLength);
}

function getRemoteContentModerationAction(
	mode: RemoteContentModerationMode,
	matches: IRemoteContentModerationMatch[]
): RemoteContentModerationAction {
	if (matches.some(match => match.action === RemoteContentModerationAction.Block)) {
		return RemoteContentModerationAction.Block;
	}
	if (matches.some(match => match.action === RemoteContentModerationAction.Quarantine)) {
		return RemoteContentModerationAction.Quarantine;
	}
	if (matches.some(match => match.action === RemoteContentModerationAction.Review)) {
		return RemoteContentModerationAction.Review;
	}
	if (mode === RemoteContentModerationMode.ReviewFirst) {
		return RemoteContentModerationAction.Review;
	}
	return RemoteContentModerationAction.Allow;
}

function getRemoteContentModerationMatch(rule: IRemoteContentModerationRule): IRemoteContentModerationMatch {
	return {
		name: rule.name,
		type: rule.type,
		field: rule.field,
		action: rule.action
	};
}

function assertSafeRemoteContentRegex(value: string): void {
	try {
		new RegExp(value, 'i');
	} catch (_e) {
		throw new Error('remote_content_moderation_regex_invalid');
	}
	if (hasUnsafeRemoteContentRegexShape(value)) {
		throw new Error('remote_content_moderation_regex_unsafe');
	}
}

function hasUnsafeRemoteContentRegexShape(value: string): boolean {
	if (/\\[1-9]|\\k</.test(value)) {
		return true;
	}
	return /\([^)]*([+*]|\{\d+,?\d*})[^)]*\)\s*([+*?]|\{\d+,?\d*})/.test(value);
}

function getArrayValues(value: any): any[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value;
}

function getOptionalBoundedString(value: any, maxLength: number): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const stringValue = String(value).trim();
	if (!stringValue) {
		return null;
	}
	if (stringValue.length > maxLength) {
		throw new Error('remote_content_moderation_value_too_long');
	}
	return stringValue;
}
