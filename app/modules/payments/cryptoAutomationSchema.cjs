exports.cryptoAutomationSchema = S => {
  const str = (n = 200) => ({type:S.STRING(n),allowNull:false});
  const id = {...str(),primaryKey:true}, json = {type:S.JSONB,allowNull:false};
  return {
    crypto_treasuries:{id,payout:str(42),version:{type:S.INTEGER,allowNull:false}},
    crypto_runtime:{id,data:json},
    crypto_hd_accounts:{id,walletFingerprint:str(64),readerId:str(),resourceId:{type:S.STRING(30),allowNull:true},addressId:str(),index:{type:S.INTEGER,allowNull:false}},
    crypto_fee_samples:{id,network:str(20),data:json},
    crypto_collections:{id,invoiceId:{...str(),unique:true},network:str(20),state:str(30),data:json,lastError:{type:S.STRING(100)}},
    crypto_transactions:{id,network:str(20),hash:{...str(66),unique:true},sender:str(42),nonce:str(100),raw:{type:S.TEXT,allowNull:false},state:str(30),data:json},
  };
};
