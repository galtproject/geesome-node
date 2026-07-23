export async function cleanupResource(
	resourceName: string,
	cleanup: () => any,
	warn: (message: string) => void = console.warn
): Promise<boolean> {
	try {
		await cleanup();
		return true;
	} catch (error) {
		warn(`resource_cleanup_failed resource=${resourceName} error=${getErrorMessage(error)}`);
		return false;
	}
}

export async function cleanupAndRethrow(
	error,
	resourceName: string,
	cleanup: () => any,
	warn: (message: string) => void = console.warn
): Promise<never> {
	await cleanupResource(resourceName, cleanup, warn);
	throw error;
}

function getErrorMessage(error): string {
	if (error?.message) {
		return String(error.message).replace(/\s+/g, ' ').slice(0, 500);
	}
	return String(error).replace(/\s+/g, ' ').slice(0, 500);
}
