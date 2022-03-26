
export default  {
	getGroupHomePage($router, groupId) {
		const { route } = $router.resolve({ name: 'group-page', params: { groupId } });
		return document.location['origin'] + '/#' + route.path;
	}
}