
export default  {
	getGroupHomePage($router, groupId) {
		const { route } = $router.resolve({ name: 'group-page', params: { groupId } });
		return document.location['origin'] + '/#' + route.path;
	},
	getInvitePage($router, code) {
		const { route } = $router.resolve({ name: 'join-by-invite', params: { code } });
		return document.location['origin'] + '/#' + route.path;
	}
}