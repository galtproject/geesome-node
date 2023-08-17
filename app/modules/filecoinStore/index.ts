import {IGeesomeApp} from "../../interface";


module.exports = async (app: IGeesomeApp) => {
    const {default: {createDeal}} = await import('ifps-tocar');
    const module = startDeal(app, createDeal);
    require('./api')(app, module);
    return module;
}


function startDeal(app: IGeesomeApp, createDeal) {
    createDeal("bafybeiceaoai4afxqqtb7dyh6duwrcg5fkqqdu7xcmbwulvydlluae3xni")
    console.log("DONE");
}