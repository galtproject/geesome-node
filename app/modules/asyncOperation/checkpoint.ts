// Atomically publish an operation checkpoint and its queue's waiting state.
export async function checkpointOperation(app, queue, expected, output, {isWaiting, ...operation}) {
    return app.ms.database.sequelize.transaction(async transaction => {
        const [changed] = await app.ms.database.sequelize.model('userAsyncOperation').update({...operation, output, inProcess: false},
            {where: {id: queue.asyncOperationId, output: expected}, transaction});
        if (!changed) {
            return false;
        }
        await app.ms.database.sequelize.model('userOperationQueue').update({isWaiting}, {where: {id: queue.id}, transaction});
        return true;
    });
}
