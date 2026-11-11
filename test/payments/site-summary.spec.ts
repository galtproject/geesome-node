import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import defineIdentity from '../../app/modules/googleAuthorization/models.js';
import definePayments from '../../app/modules/payments/models.js';
import {createGoogleAuthorization} from '../../app/modules/googleAuthorization/index.js';
import {ownerPayments} from '../../app/modules/membership/ownerPayments.js';

const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
test('site totals exceed history limits, isolate sites and retain known accounts after logout', {skip: !url}, async () => {
	const db = new Sequelize(url!, {logging: false});
	try {
		await db.getQueryInterface().dropAllTables();
		const M = await definePayments(db);
		const identityModels = await defineIdentity(db);
		const {Identity, Session, SiteAccount} = identityModels;
		const account = randomUUID(), historic = randomUUID(), other = randomUUID();
		await SiteAccount.bulkCreate([{siteId:'wave',identityId:account},{siteId:'meat',identityId:other}]);
		await M.invoices.bulkCreate(Array.from({length:63}, (_,i) => ({id:randomUUID(),resourceId:'wave',readerId:i ? account : historic,
			requestKey:randomUUID(),optionSnapshot:{},status:i < 4 ? 'paid' : i === 4 ? 'refunded' : 'expired',paidAt:i < 5 ? new Date() : null})));
		await M.invoices.create({id:randomUUID(),resourceId:'meat',readerId:other,requestKey:randomUUID(),optionSnapshot:{},status:'paid',paidAt:new Date()});
		const service = ownerPayments(M, Identity, async id => {assert(['wave','meat','empty'].includes(id));}, SiteAccount);
		assert.deepEqual(await service.ownerSummary('wave'), {registeredAccounts:2,createdInvoices:63,paidInvoices:5,accountHistory:'known',period:'all-time'});
		assert.deepEqual(await service.ownerSummary('empty'), {registeredAccounts:0,createdInvoices:0,paidInvoices:0,accountHistory:'known',period:'all-time'});
		await Session.create({id:randomUUID(),identityId:historic,userId:1,siteId:'meat',tokenHash:'a'.repeat(64),expiresAt:new Date()});
		await defineIdentity(db); // startup preserves pre-tracking session history
		await Session.destroy({where:{}});
		assert.equal((await service.ownerSummary('meat')).registeredAccounts, 2);
		await assert.rejects(service.ownerSummary('missing'));
		let nonce = '';
		const google = createGoogleAuthorization({ms:{database:{sequelize:db,models:{User:{create:async()=>({id:1}),findByPk:async()=>({id:1})}}}}}, identityModels, {
			google:{verifyIdToken:async()=>({getPayload:()=>({iss:'https://accounts.google.com',aud:'test',exp:Date.now()/1000+600,sub:'new-reader',email_verified:true,email:'test@example.test',nonce})})}
		});
		const site = {id:'wave',googleClientId:'test',registrationEnabled:true};
		for (let i=0;i<2;i++) {
			const challenge = await google.challenge({headers:{}}, site);
			nonce = challenge.nonce;
			const req = {headers:{cookie:challenge.cookie.split(';')[0]},body:{credential:'mock'}};
			const login = await google.login(req, site);
			await google.sessions.logout({headers:{cookie:login.cookie.split(';')[0]}}, 'wave');
		}
		assert.equal((await service.ownerSummary('wave')).registeredAccounts, 3, 'repeat logins count once and logout retains registration');
	} finally {
		await db.close();
	}
});
