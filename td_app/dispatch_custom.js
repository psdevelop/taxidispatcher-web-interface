var config = {
	user: 'disp_server',
	password: 'disp_server',
	server: 'localhost\\SQLEXPRESS', // You can use 'localhost\\instance' to connect to named instance
	database: 'TD5R1',

	options: {
		encrypt: false // Use this if you're on Windows Azure
	}
};

module.exports.config = config;
//module.exports.f = f;
