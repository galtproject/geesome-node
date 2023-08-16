import {IGeesomeApp} from "../../interface";


module.exports = async (app: IGeesomeApp) => {
    const {default: {prepareRender}} = await import('ifps-tocar');
    app.checkModules(['asyncOperation', 'group', 'content']);
    const module = getModule(app, await require('./models')(), prepareRender);
    require('./api')(app, module);
    return module;
}


function getModule(app: IGeesomeApp, models, prepareRender) {


}