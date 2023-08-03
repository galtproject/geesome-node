
module.exports = {
	options: {
		// 'logging': (d) => {log(d)},
		'dialect': 'sqlite',
		'storage': `${process.env.DATA_DIR || 'data'}/async-operations-database.sqlite`
	}
}