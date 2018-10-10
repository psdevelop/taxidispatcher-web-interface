//'use strict';

var http = require('http'),
	request = require('request'),
	encoding = require('encoding'),
	express = require('express'),
	app = module.exports.app = express(),
	session = require("express-session")({
		secret: 'keyboard cat',
		resave: true,
		saveUninitialized: true,
		cookie: { maxAge: 60000 }
	}),
	socketsParams = {},
	custom = require('./dispatch_custom');
	//sharedsession = require("express-socket.io-session");

//({
//	secret: "my-secret",
//	resave: true,
//	saveUninitialized: true
//})

app.listen(6031, function () {
	console.log('Express app listening on port 6031!');
});

app.use(express.static(__dirname + '/tdclient'));
//app.use(session);
// Use the session middleware
app.use(session);
//app.use(express.cookieDecoder());
//app.use(express.session());

var server = http.createServer(app);
var io = require('socket.io')(server);  //pass a http.Server instance
//io.use(sharedsession(session, {
//	autoSave: true
//}));
server.listen(8085);
console.log('Сервер диспетчерских приложений TaxiDispatcher запущен на порту 8085...');

var sql = require('mssql');
var clientsLimit = 50;
var clientsCount = 0;

var config = custom.config;

//модуль интеграции с Астериском (информатор)
(function() {
	if (!custom.useAMIClient) {
		console.log('AMI-client disable.');
		return;
	}

	var connectionAMI, createConnection = function() {
			connectonAttempts++;
			if (connectonAttempts > 5) {
				return;
			}

			connectionAMI = createAMIDBConnPool(
				config,
				function() {
					console.log('Success db-connection of ami module!');
					initAMI();
				}
			);
		}, connectonAttempts = 0;

	createConnection();
	
	function createAMIDBConnPool(connConfig, callBack) {
		return new sql.ConnectionPool(connConfig, function (err) {
			// ... error checks
			if (err) {
				console.log('Err of create ami db pool' + err.message);                      // Canceled.
				console.log(err.code);
				console.log('Next connection attempt after 60 sec...');
				setTimeout(createConnection, 60000);
			} else {
				callBack && callBack();
			}
		});
	}
	
	function findOrderByPhone(phone, callback) {
		queryRequest('SELECT TOP 1 ord.BOLD_ID, (CAST(dr.avar1 as varchar(20)) + \',\' + CAST(dr.avar2 as varchar(20)) + \',\' + CAST(dr.avar3 as varchar(20)) + \',\' + CAST(dr.avar4 as varchar(20)) + \',\' + CAST(dr.avar5 as varchar(20)) + \',\' + CAST(dr.avar6 as varchar(20)) + \',\' + CAST(dr.avar7 as varchar(20)) + \',\' + CAST(dr.avar8 as varchar(20)) + \',\' + CAST(dr.avar9 as varchar(20)) + \',\') as vids FROM Zakaz ord INNER JOIN Voditelj dr ON ord.vypolnyaetsya_voditelem = dr.BOLD_ID WHERE   \'' + phone + '\' LIKE (\'%\' + ord.Telefon_klienta + \'%\') AND REMOTE_SET >= 0 AND REMOTE_SET <=8 AND Zavershyon = 0 AND Arhivnyi = 0;',
			function (recordset) {
				if (recordset && recordset.recordset &&
					recordset.recordset.length) {
					var vids = recordset.recordset[0].vids;
					callback(vids);
				}
			},
			function (err) {
				console.log('Err of findOrderByPhone! ' + err);
			},
			connectionAMI
		);
	}
	
	function initAMI() {
		var AmiIo = require("ami-io"),
			SilentLogger = new AmiIo.SilentLogger(), //use SilentLogger if you just want remove logs
			amiio = AmiIo.createClient(custom.amiConfig);
			//amiio2 = new AmiIo.Client({ logger: SilentLogger });
			amiio.useLogger(SilentLogger);

		//Both of this are similar

		amiio.on('incorrectServer', function () {
			amiio.logger.error("Invalid AMI welcome message. Are you sure if this is AMI?");
			//process.exit();
		});
		amiio.on('connectionRefused', function(){
			amiio.logger.error("Connection refused.");
			//process.exit();
		});
		amiio.on('incorrectLogin', function () {
			amiio.logger.error("Incorrect login or password.");
			//process.exit();
		});
		amiio.on('event', function(event){
			var eventName = event.event;
			if (['Newexten', 
				'VarSet', 
				'InvalidAccountID', 
				'SuccessfulAuth']
					.indexOf(eventName) < 0) {
				console.log('AMI: ' + eventName);
				if (['Newchannel']
					.indexOf(eventName) >= 0) { //NewConnectedLine, DialBegin
					//console.log(event);
					if (event.channel && event.channel.indexOf('SIP/SIP988') >= 0) {
						if (event.calleridnum && event.calleridnum
							.length >= 5) {

							console.log('Autoinformator call');

							var callbackRedirect = function() { redirectCall(event); },
								callbackFindOrder = function(vids) { setChannelVar(event, 'vids', vids, callbackRedirect); };

							findOrderByPhone(event.calleridnum, callbackFindOrder)

							function setChannelVar(channelEvent, varName, value, callback) {
								var actionSetVar = new AmiIo.Action.SetVar();
								actionSetVar.Channel = channelEvent.channel;
								actionSetVar.Variable = varName;
								actionSetVar.Value = value;
								amiio.send(actionSetVar, function(err, data){
									if (err){
										//err will be event like OriginateResponse if (#response !== 'Success')
										console.log(err);
									}
									else {
										callback();
										//data is event like OriginateResponse if (#response === 'Success')
									}
								});
							}
							
							function redirectCall(channelEvent) {
								var actionRedirect = new AmiIo.Action.Redirect();
								actionRedirect.Channel = channelEvent.channel;
								actionRedirect.Context = 'from-trunk';
								actionRedirect.Exten = '102';
								actionRedirect.Priority = 1;
							
								amiio.send(actionRedirect, function(err, data){
									if (err){
										//err will be event like OriginateResponse if (#response !== 'Success')
										console.log(err);
									}
									else {
										//data is event like OriginateResponse if (#response === 'Success')
									}
								});
							}
						}
					}
				}
			}
			
		});
		amiio.connect();
		amiio.on('connected', function(){
		});
	
	}

})();

// Access the session as req.session
app.get('/sess', function(req, res, next) {
	if (req.session.views) {
		req.session.views++;
		res.setHeader('Content-Type', 'text/html')
		res.write('<p>views: ' + req.session.views + '</p>')
		res.write('<p>expires in: ' + (req.session.cookie.maxAge / 1000) + 's</p>')
		console.log('ttt2: ' + JSON.stringify(req.session));
		res.end()
	} else {
		req.session.views = 1;
		console.log('ttt1: ' + JSON.stringify(req.session));
		res.end('welcome to the session demo. refresh!')
	}
})

app.get('/', function(req, res) {
	req.session.message = 'Hello World';
	console.log('kkk');
});

function findClientsSocket(roomId, namespace) {
	var res = [],
		ns = io.of(namespace || "/");    // the default namespace is "/"

	if (ns) {
		for (var id in ns.connected) {
			if (roomId) {
				var index = ns.connected[id].rooms.indexOf(roomId);
				if (index !== -1) {
					res.push(ns.connected[id]);
				}
			} else {
				//console.log('[[' + JSON.stringify(io.sockets) + ']]');
				res.push(ns.connected[id]);
			}
		}
	}
	return res;
}

function checkSocketClients() {
	var currentDate = '[' + new Date().toUTCString() + '] ',
		clcnt = 0, socketId;
	console.log(currentDate);
	var resC = findClientsSocket(), socketsIds = [];
	for (i = 0; i < resC.length; i++) {
		//console.log(Object.keys(resC[i]));
		console.log(resC[i].id);
		clcnt++;
		socketsIds.push(resC[i].id);
	}

	for (socketId in socketsParams) {
		if (socketsIds.indexOf(socketId) < 0) {
			socketsParams[socketId] = {};
		}
	}

	clientsCount = clcnt;
	return false;
}

function hasSocketWithUserId(userId) {
	var hasSocket = false, socketId;

	for (socketId in socketsParams) {
		if (socketsParams[socketId].userId === userId) {
			hasSocket = true;
			break;
		}
	}

	return hasSocket;
}

setInterval(checkSocketClients, 60000);

function sendAPIRequest(params, success, fail, options) {
	request(Object.assign(
		{
			method: 'GET'
		}, params
	), function (err, res, body) {
		if (err) {
			console.log(err);
			fail && fail(options);
			return;
		}
	
		if (!body) {
			console.log('No body!');
			fail && fail(options);
			return;
		}
		
		console.log(body);

		try {
			success && success(JSON.parse(body), options);
		} catch (e) {
			console.log('Error of parsing json: ' +
			body + '\n' + JSON.stringify(params) + e);
			fail && fail(options);
			return;
		}
	});
}

//модуль определения координат и сектора заказа по его адресу
(function() {
	var sectors = {}, isActiveDetecting = false, minLat = false,
		minLon = false, maxLat = false, maxLon = false,
		defaultGeocodingPrefix = '', enableAutoSectorDetect = false,
		connectionTasks, createConnection = function() {
			connectonAttempts++;
			if (connectonAttempts > 5) {
				return;
			}

			connectionTasks = createTasksDBConnPool(
				config,
				function() {
					console.log('Success db-connection of plan tasks module!');
					checkAutoSectorDetectSettings();
				}
			);
		}, connectonAttempts = 0;

	createConnection();
	
	function createTasksDBConnPool(connConfig, callBack) {
		return new sql.ConnectionPool(connConfig, function (err) {
			// ... error checks
			if (err) {
				console.log('Err of create tasks db pool' + err.message);                      // Canceled.
				console.log(err.code);
				console.log('Next connection attempt after 60 sec...');
				setTimeout(createConnection, 60000);
			} else {
				callBack && callBack();
			}
		});
	}
	
	function checkAutoSectorDetectSettings() {
		queryRequest('SELECT TOP 1 auto_detect_sector_by_addr, geocode_default_prefix FROM Objekt_vyborki_otchyotnosti WHERE Tip_objekta=\'for_drivers\';',
			function (recordset) {
				if (recordset && recordset.recordset &&
					recordset.recordset.length && 
					recordset.recordset.length == 1) {
					var settingsList = recordset.recordset;
					//console.log(sectorCoordsList);
					settingsList.forEach(function(setting) {
						enableAutoSectorDetect = setting.auto_detect_sector_by_addr;
						defaultGeocodingPrefix = setting.geocode_default_prefix;
					});
				}

				if (enableAutoSectorDetect) {
					getSectorsCoordinates();
				} else {
					console.log('Auto detect sector is off! Next check after 60 sec...');
					setTimeout(checkAutoSectorDetectSettings, 60000);
				}
			},
			function (err) {
				setTimeout(checkAutoSectorDetectSettings, 60000);
				console.log('Err of check auto detect sector settings! ' + err);
				console.log('Next attempt after 60 sec...');
			},
			connectionTasks
		);
	}
		
	function getSectorsCoordinates() {
		queryRequest('SELECT sc.*, dc.Naimenovanie, al.* FROM Sektor_raboty sc INNER JOIN Spravochnik dc ON sc.BOLD_ID = dc.BOLD_ID INNER JOIN AREA_LINES al ON sc.BOLD_ID = al.SECTOR_ID ORDER BY sc.BOLD_ID ASC, al.order_num ASC',
			function (recordset) {
				if (recordset && recordset.recordset &&
					recordset.recordset.length) {
					var sectorCoordsList = recordset.recordset;
					//console.log(sectorCoordsList);
					sectorCoordsList.forEach(function(sectorCoord) {
						if (!sectors[sectorCoord.BOLD_ID]) {
							sectors[sectorCoord.BOLD_ID] = {
								name: sectorCoord.Naimenovanie,
								coords: []
							}
						}
						
						if (minLat === false || minLat > sectorCoord.lat) {
							minLat = sectorCoord.lat;
						}
						
						if (minLon === false || minLon > sectorCoord.lon) {
							minLon = sectorCoord.lon;
						}
						
						if (maxLat === false || maxLat < sectorCoord.lat) {
							maxLat = sectorCoord.lat;
						}
						
						if (maxLon === false || maxLon < sectorCoord.lon) {
							maxLon = sectorCoord.lon;
						}
						
						sectors[sectorCoord.BOLD_ID].coords.push({
							lat: sectorCoord.lat,
							lon: sectorCoord.lon
						});
					});
				}
				
				//console.log(sectors);
				setInterval(geocodeOrderAddresses, 3000);
			},
			function (err) {
				setTimeout(getSectorsCoordinates, 5000);
				console.log('Err of sectors coordinates request! ' + err);
			},
			connectionTasks);
	}
	
	function isPointInsidePolygon (coordsList, xd, yd) {
		var i1, i2, n, pcount, //int
			S, S1, S2, S3, x, y, //long
			flag = false;

		x = Math.round(xd * 1000);
		y = Math.round(yd * 1000);

		if (!coordsList || !coordsList.length || coordsList.length <= 2) {
			return false;
		}

		pcount = coordsList.length;
		var p = {}, i = 0;

		//for (var i = 0; i < pcount; i++)	{
		coordsList.forEach(function(coord) {
			p[i] = {};
			p[i][1] = Math.round(coord.lat * 1000);
			p[i][0] = Math.round(coord.lon * 1000);
			i++;
		});

		for (n = 0; n < pcount; n++) {
			
			flag = false;
			i1 = n < (pcount - 1) ? (n + 1) : 0;
			
			while (!flag) {
				i2 = i1 + 1;
				
				if (i2 >= pcount) {
					i2 = 0;
				}
				
				if (i2 == (n < (pcount - 1) ? (n + 1) : 0)) {
					break;
				}

				S = Math.abs( p[i1][0] * (p[i2][1] - p[n][1]) +
					p[i2][0] * (p[n][1] - p[i1][1]) +
					p[n][0]  * (p[i1][1] - p[i2][1]) );
				S1 = Math.abs( p[i1][0] * (p[i2][1] - y) +
					p[i2][0] * (y       - p[i1][1]) +
					x * (p[i1][1] - p[i2][1]) );
				S2 = Math.abs( p[n][0] * (p[i2][1] - y) +
					p[i2][0] * (y       - p[n][1]) +
					x * (p[n][1] - p[i2][1]) );
				S3 = Math.abs( p[i1][0] * (p[n][1] - y) +
					p[n][0] * (y       - p[i1][1]) +
					x * (p[i1][1] - p[n][1]) );
		
				if (S == S1 + S2 + S3) {
					flag = true;
					break;
				}
		
				i1 = i1 + 1;
				if (i1 >= pcount) {
					i1 = 0;
				}
			}
		
			if (!flag) {
				break;
			}
		}
	  
		return flag;
	}

	function geocodeOrderAddresses() {
		//console.log('Check orders for geocoded...');
		if (isActiveDetecting) {
			console.log('Sector detect is active... out');
			return;
		}
		
		isActiveDetecting = true;
		queryRequest('SELECT ord.BOLD_ID, ord.Adres_vyzova_vvodim, ord.district_id, ISNULL(dis.address, \'\') as geocode_addr, ISNULL(dis.default_sector_id, 0) as default_sector_id FROM Zakaz ord LEFT JOIN DISTRICTS dis ON ord.district_id = dis.id WHERE ord.Zavershyon = 0 ' + 
			' AND ord.failed_adr_coords_detect = 0 AND ord.detected_sector = -1 AND LEN(ISNULL(ord.Adres_vyzova_vvodim,\'\')) > 2 ',
			function (recordset) {
				//console.log('111');
				if (recordset && recordset.recordset &&
					recordset.recordset.length) {
					var orderList = recordset.recordset;
					//console.log(orderList);
					orderList.forEach(function(order) {
						console.log((order.district_id && order.district_id > 0 && order.geocode_addr ? order.geocode_addr : defaultGeocodingPrefix) + ',' + order.Adres_vyzova_vvodim);

						if (minLat === false || minLon === false || 
							maxLat === false || maxLon === false) {

							isActiveDetecting = false;
							setFailOrderSectDetect(order.BOLD_ID, 
								order.default_sector_id);
							console.log('Missing bbox!');
							return;
						}
						
						sendAPIRequest(
							{
								url: 'http://search.maps.sputnik.ru/search/addr',
								qs: {
									q: (order.district_id && order.district_id > 0 && order.geocode_addr ? order.geocode_addr : defaultGeocodingPrefix) + ',' + order.Adres_vyzova_vvodim//, //
									//blat: minLat,
									//blon: maxLon,
									//tlat: maxLat,
									//tlon: minLon,
									//strict: true
								}
							},
							detectSectorOnGeocodeData,
							geocodeApiFailCallback,
							{
								orderId: order.BOLD_ID,
								defaultSectorId: order.default_sector_id,
								'minLat': minLat,
								'minLon': minLon,
								'maxLat': maxLat,
								'maxLon': maxLon
							}
						);
					});
				} else {
					isActiveDetecting = false;
				}
			},
			function (err) {
				isActiveDetecting = false;
				console.log('Err of geocodeOrderAddresses request! ' + err);
			},
			connectionTasks);
	}
	
	function geocodeApiFailCallback(options) {
		isActiveDetecting = false;
		setFailOrderSectDetect(options.orderId, options.defaultSectorId);
	}
	
	function getAddrPointsByFeatureGeometries(featureGeometries, options) {
		var pointGeometryList = featureGeometries && featureGeometries.length && 			featureGeometries.filter(function(geom) { return geom.type === 'Point'; }), geoPoint, pointCoordinates, pointLat, pointLon, result = false, i;
			
		if (!(pointGeometryList && pointGeometryList.length)) {
			return result;
		}
			
		for (i = 0; i < pointGeometryList.length; i++) {
			geoPoint = pointGeometryList[i],
			pointCoordinates = geoPoint && geoPoint.coordinates;
			pointLat = pointCoordinates && pointCoordinates.length && pointCoordinates[1];
			pointLon = pointCoordinates && pointCoordinates.length && pointCoordinates[0];
			
			if (pointLat >= options.minLat && pointLat <= options.maxLat && 
				pointLon >= options.minLon && pointLon <= options.maxLon) {
				return [pointLon, pointLat];
			}
		}
		
		return result;
	}
	
	function getAddrPointsByFeatureCollection(featureCollection, options) {
		var featuresList = featureCollection && featureCollection.features && featureCollection.features.length && featureCollection.features.filter(function(feat) { return feat.type === 'Feature'; }), feature, featureGeometries, i, result = false, points;
		
		if (!(featuresList && featuresList.length)) {
			return result;
		}
		
		for (i = 0; i < featuresList.length; i++) {
			feature = featuresList[i];
			featureGeometries = feature && feature.geometry && feature.geometry.type && feature.geometry.type === 'GeometryCollection' && feature.geometry.geometries;
			
			points = getAddrPointsByFeatureGeometries(featureGeometries, options);
			if (points !== false) {
				return points;
			}
		}
		
		return result;
	}
	
	function detectSectorOnGeocodeData(data, options) {
		var sector, result = data && data.result,
			orderId = options && options.orderId, isDetected = false,
			defaultSectorId = options && options.defaultSectorId, idx,
			address = result && result.priority && result.priority === 'address' && result.address && result.address.length && result.address.filter(function(addr) { return addr.type === 'FeatureCollection'; }), featureCollection,
			pointCoordinates, pointLat, pointLon;
			
			if (!(address && address.length)) {
				setFailOrderSectDetect(orderId, defaultSectorId);
			}
			
			for (idx = 0; idx < address.length; idx++) {
				featureCollection = address[idx];
				pointCoordinates = getAddrPointsByFeatureCollection(featureCollection, options);
				if (pointCoordinates !== false && pointCoordinates && pointCoordinates.length) {
					pointLat = pointCoordinates && pointCoordinates.length && pointCoordinates[1];
					pointLon = pointCoordinates && pointCoordinates.length && pointCoordinates[0];
				}
			}
			/*featuresList = featureCollection && featureCollection.features && featureCollection.features.length && featureCollection.features.filter(function(feat) { return feat.type === 'Feature'; }),
			feature = featuresList && featuresList.length && featuresList[0],
			featureGeometries = feature && feature.geometry && feature.geometry.type && feature.geometry.type === 'GeometryCollection' && feature.geometry.geometries,*/
			
			/*pointGeometryList = featureGeometries && featureGeometries.length && featureGeometries.filter(function(geom) { return geom.type === 'Point'; }),
			geoPoint = pointGeometryList && pointGeometryList.length && pointGeometryList[0],
			pointCoordinates = geoPoint && geoPoint.coordinates,*/
			//pointCoordinates = getAddrPointsByFeatureGeometries(featureGeometries, options),

			if (pointLat && pointLon && orderId) {
				console.log('Point lat=' + pointLat + ', lon=' + pointLon);
				for (i in sectors) {
					sector = sectors[i];
					//console.log(sector.coords);
					//console.log(isPointInsidePolygon(sector.coords, pointLon, pointLat));
					//console.log(isPointInsidePolygon(sector.coords, pointLat, pointLon));
					if (isPointInsidePolygon(sector.coords, pointLon, pointLat)) {
						console.log('Point lat=' + pointLat + ', lon=' + pointLon + 
							' inside to ' + sector.name);
						queryRequest('UPDATE Zakaz SET detected_sector = ' + i 
						+ ', adr_detect_lat = \'' + pointLat + '\', adr_detect_lon = \'' + 
						pointLon + '\' WHERE BOLD_ID = ' + orderId,
							function (recordset) {
								isActiveDetecting = false;
							},
							function (err) {
								setFailOrderSectDetect(orderId, defaultSectorId);
								console.log('Err of order detected sector assign request! ' + err);
							},
							connectionTasks);

						isDetected = true;
						break;
					}
				}
			}

			//console.log('333');
			if (!isDetected && orderId) {
				setFailOrderSectDetect(orderId, defaultSectorId);
			} else {
				isActiveDetecting = false;
			}
	}
	
	function setFailOrderSectDetect(orderId, sector_id) {
		queryRequest('UPDATE Zakaz SET failed_adr_coords_detect = 1 ' + 
			(sector_id ? (' ,detected_sector = ' + sector_id + ' ') : ' ') 
			+ ' WHERE BOLD_ID = ' + orderId,
			function (recordset) {
				isActiveDetecting = false;
			},
			function (err) {
				isActiveDetecting = false;
				console.log('Err of order FAIL detected sector SET FLAG request!');			
			},
			connectionTasks);
	}

})();
	
function queryRequest(sqlText, callbackSuccess, callbackError, connection) {
		var request = new sql.Request(connection);
		request.query(sqlText, function (err, recordset) {
			if (err) {
				console.log(err.message);
				console.log(err.code);
				callbackError && callbackError(err);
			} else {
				callbackSuccess && callbackSuccess(recordset);
			}
		});
	}

io.sockets.on('connection', function (socket) {
	console.log('New sock id: ' + socket.id);
	socketsParams[socket.id] = {};
	var reqTimeout = 0;
	var reqCancelTimeout = 0;
	var stReqTimeout = 0;
	var authTimeout = 0;
	var clientActiveTime = 0;
	var socketDBConfig = config;
	var webProtectedCode = '';//socket.handshake.session.webProtectedCode || '';
	var userId = -1;

	//console.log('fff: ' + JSON.stringify(socket.handshake.session));

	//socketDBConfig.user = '';//socket.handshake.session.user || '';
	//socketDBConfig.password = '';//socket.handshake.session.password || '';

	var condition = {
			orders:
				{
					Zavershyon: 0,
					Arhivnyi: 0,
					Predvariteljnyi: 0
				}
		},
		condDependencies = [
			{
				type: 'dataSelect',
				staticExpression: 'TOP',
				Arhivnyi: 1,
				Zavershyon: 1,
				Predvariteljnyi: 'NONE',
				injectExpression: 'TOP 20'
			},
			{
				type: 'dataSelect',
				staticExpression: 'ORDER',
				Arhivnyi: 1,
				Zavershyon: 1,
				Predvariteljnyi: 'NONE',
				injectExpression: 'ORDER BY BOLD_ID DESC'
			}
		];

	function getDependenceInject(options) {
		if (!options) {
			return '';
		}
		
		var dependencies = condDependencies, dependStr = '';
		
		for (i in options) {
			dependencies = dependencies.filter(function(dependency) {
				return dependency[i] && (dependency[i] === options[i] || dependency[i] === 'NONE');
			});
		}
		
		dependencies.forEach(function(dependency) {
			dependStr += dependency.injectExpression;
		});
		
		console.log('dependStr: ' + dependStr);
		return dependStr;
	}
		
	function decReqTimeout() {
		if (reqTimeout > 0)
			reqTimeout--;
		if (stReqTimeout > 0)
			stReqTimeout--;
		if (reqCancelTimeout > 0)
			reqCancelTimeout--;
		if (authTimeout > 0)
			authTimeout--;
	}

	setInterval(decReqTimeout, 1000);

	if ((clientsCount + 1) > clientsLimit) {
		socket.emit('server overload', {me: -1});
		try {
			socket.disconnect('server overload');
		} catch (e) {
			console.log('error socket disconnect');
		}
		try {
			socket.close();
		} catch (e) {
			console.log('error socket close');
		}
		return;
	} else {
		console.log('client connect, num=' + clientsCount);
		clientsCount++;
	}

	var connection = createDBConnPool(socketDBConfig);
	
	function createDBConnPool(connConfig, callBack) {
		return new sql.ConnectionPool(connConfig, function (err) {
			// ... error checks
			if (err) {
				console.log('Err of create db pool: ' + err.message);                      // Canceled.
				console.log(err.code);
			} else {
				callBack && callBack();
			}
		});
	}
	
	function dependencyExpression(optionsArray) {
		var dependOptions = {};
		
		optionsArray.forEach(function(optionItem) {
			Object.assign(
				dependOptions, optionItem)
		});
		
		console.log(dependOptions);
		return getDependenceInject(dependOptions);
	}

	function emitData(entity) {
		if (entity.indexOf('orders') === 0 && entity.indexOf('orders_coordinates') !== 0) {
			var request = new sql.Request(connection),
				whereClause = ' where (Zavershyon = ' + condition.orders.Zavershyon + ') AND ' +
					' (Arhivnyi = ' + condition.orders.Arhivnyi + ')';
			request.query('select ' + dependencyExpression([{type: 'dataSelect',
				staticExpression: 'TOP'}, condition.orders]) + ' * FROM ActiveOrders ' + whereClause + dependencyExpression([{type: 'dataSelect',
				staticExpression: 'ORDER'}, condition.orders]), function (err, recordset) {
				socket.emit('orders', {
					userId: userId,
					orders: recordset && recordset.recordset
				});
			});
		} else if (entity.indexOf('drivers') === 0) {
			var whereClause = ' where V_rabote = 1 AND Pozyvnoi > 0';
			queryRequest('SELECT BOLD_ID as id, Pozyvnoi, last_lat, last_lon, Na_pereryve,' + 
				' rabotaet_na_sektore, Zanyat_drugim_disp FROM Voditelj ' + whereClause,
				function (recordset) {
					if (recordset && recordset.recordset) {
						socket.emit('drivers', {
							userId: userId,
							drivers: recordset && recordset.recordset
						});
					}
				},
				function (err) {
				}, 
				connection);
		} else if (entity.indexOf('orders_coordinates') === 0) {
			var whereClause = ' where Zavershyon = 0 AND Arhivnyi = 0 AND (NOT (ISNULL(rclient_lat, \'\') = \'\' OR ISNULL(rclient_lon, \'\') = \'\') OR NOT (ISNULL(adr_detect_lat, \'\') = \'\' OR ISNULL(adr_detect_lon, \'\') = \'\'))';
			console.log('orders_coordinates');
			queryRequest('select BOLD_ID as id, (CASE WHEN (ISNULL(rclient_lat, \'\') <> \'\') THEN rclient_lat ELSE adr_detect_lat END) as lat, (CASE WHEN (ISNULL(rclient_lat, \'\') <> \'\') THEN rclient_lon ELSE adr_detect_lon END) as lon, Adres_vyzova_vvodim as addr FROM Zakaz' + whereClause, 
				function (recordset) {
					console.log(recordset.recordset);
					recordset.recordset && recordset.recordset.length && socket.emit('orders_coordinates', 
						{
							userId: userId,
							orders: recordset && recordset.recordset
						});
				},
				function (err) {
					console.log(err);
				}, 
				connection);
		}
	}
	
	function checkDriversCoordsUpdated() {
		queryRequest('SELECT drivers_coord_updated, orders_coord_updated FROM Personal WHERE (drivers_coord_updated = 1 OR orders_coord_updated = 1) AND BOLD_ID = ' + userId ,
			function (recordset) {
				if (recordset && recordset.recordset && 
					recordset.recordset.length) {
					
					var drivers_coord_updated = recordset.recordset[0].drivers_coord_updated,
						orders_coord_updated = recordset.recordset[0].orders_coord_updated;
					queryRequest(
						'UPDATE Personal SET drivers_coord_updated = 0, orders_coord_updated = 0 WHERE BOLD_ID = ' + userId,
						function (recordset) {
							console.log('emit updated drivers coords');
							drivers_coord_updated && emitData('drivers');
							orders_coord_updated && emitData('orders_coordinates');
						},
						function (err) {
						}, 
						connection);
				}
			},
			function (err) {
			}, 
			connection);
	}

	socket.on('crud', function (data) {
		console.log(data);
		if (typeof data === 'string') {
			tp = tryParseJSON(data);
			console.log("=======");
			console.log(tp);
			if (tp)
				data = tp;
		}

		if (data && data.entity && data.entity === 'order') {
			emitData('orders');
		}
	});
	
	socket.on('app-state', function (data) {
		console.log('app-state');
		emitData('orders');
		emitData('drivers');
		emitData('orders_coordinates');
	});

	socket.on('orders-state', function (data) {
		console.log(data);
		if (typeof data === 'string') {
			tp = tryParseJSON(data);
			console.log("=======");
			console.log(tp);
			if (tp)
				data = tp;
		}

		if (data.aspects && data.aspects.length) {
			var aspects = data.aspects;
			data = data.states;
			console.log(aspects);

			aspects.forEach(function(aspect) {
				eval(aspect + '(data);');
			});
		}

		condition.orders = data;
		emitData('orders');
	});

	socket.on('my other event', function (data) {
		console.log(data);
	});

	function tryParseJSON(jsonString) {
		try {
			var o = JSON.parse(jsonString);

			if (o && typeof o === "object" && o !== null) {
				return o;
			}
		}
		catch (e) {
		}

		return false;
	};

	function identDBConnectCallback() {
		queryRequest('SELECT TOP 1 web_protected_code FROM Objekt_vyborki_otchyotnosti ' +
			' WHERE Tip_objekta = \'for_drivers\' AND web_protected_code = \'' +
			webProtectedCode + '\'',
			function (recordset) {
				if (recordset && recordset.recordset &&
					recordset.recordset.length) {

					//socket.handshake.session.webProtectedCode = webProtectedCode;
					//socket.handshake.session.user = socketDBConfig.user;
					//socket.handshake.session.password = socketDBConfig.password;
					//socket.handshake.session.save();

					//console.log('ggg: ' + JSON.stringify(socket.handshake.session));

					queryRequest('SELECT TOP 1 BOLD_ID FROM Personal ' +
						' WHERE Login = \'' + socketDBConfig.user + '\'',
						function (recordset) {
							if (recordset && recordset.recordset &&
								recordset.recordset.length) {

								userId = recordset.recordset[0].BOLD_ID;
								
								if (hasSocketWithUserId(userId)) {
									abortConnection('Данный пользователь уже подключен!');
									return;
								}
								
								socketsParams[socket.id]['userId'] = userId;
								
								emitData('orders');
								console.log('emit drivers');
								emitData('drivers');
								console.log('emit orders_coordinates');
								emitData('orders_coordinates');
								setInterval(checkDriversCoordsUpdated, 10000);
							}
						},
						function (err) {
						},
						connection);
				}
			},
			function (err) {
			}, 
			connection);

		if (authTimeout <= 0) {
			authTimeout = 20;

			var request = new sql.Request(connection);

			request.input('phone', sql.VarChar(255), data.phone);
			request.output('client_id', sql.Int, data.id);
			request.output('req_trust', sql.Int, 0);
			request.output('isagainr', sql.Int, 0);
			request.output('acc_status', sql.Int, 0);
			request.execute('CheckClientRegistration', function (err, recordsets, returnValue) {
				if (err) {
					console.log('Error of CheckClientRegistration:' + err.message);
					console.log('Error code:' + err.code);
				} else {
					var parameters = recordsets.output;
					console.log('CheckClientRegistration result client_id=' + parameters.client_id);
					socket.emit('auth', {
						client_id: parameters.client_id,
						req_trust: parameters.req_trust,
						isagainr: parameters.isagainr,
						acc_status: parameters.acc_status
					});
				}

			});
		} else
			console.log("Too many requests from " + data.phone);
	}

	socket.on('ident', function (data) {
		console.log(data);
		console.log("=======");
		console.log(typeof data);
		if (typeof data === 'string') {
			tp = tryParseJSON(data);
			if (tp)
				data = tp;
		}
		socketDBConfig.user = data.login;
		socketDBConfig.password = data.psw;
		webProtectedCode = data.code;
		connection = createDBConnPool(socketDBConfig, identDBConnectCallback);
	});
	
	function abortConnection(abortMsg) {
		socket.emit('abort_connection', {
			msg: abortMsg,
		});
		connection = null;
	}

	function requestAndSendStatus(conn, cid, clphone, direct) {
		if (stReqTimeout <= 0 || direct) {
			stReqTimeout = 20;
			var request = new sql.Request(conn);
			request.input('client_id', sql.Int, parseInt(cid));
			//request.input('adres', sql.VarChar(255), encoding.convert('привет мир','CP1251','UTF-8'));
			request.input('phone', sql.VarChar(255), clphone);
			request.input('full_data', sql.Int, 0);
			request.output('res', sql.VarChar(2000), '');
			request.execute('GetJSONRClientStatus', function (err, recordsets, returnValue) {
				if (err) {
					console.log(err.message);                      // Canceled.
					console.log(err.code);                         // ECANCEL //
				} else {
					var parameters = recordsets.output;
					socket.emit('clstat', {cl_status: parameters.res});
				}

			});
		} else {
			console.log("Too many requests from " + clphone);
		}
	}

	socket.on('status', function (data) {
		//console.log(data);
		//console.log("=======");
		//console.log(typeof data);
		//if (typeof data === 'string') {
		//	tp = tryParseJSON(data);
		//	console.log("=======");
		//	console.log(tp);
		//	if (tp)
		//		data = tp;
		//}

		requestAndSendStatus(connection, data.cid);
		console.log("Status request: " + JSON.stringify(data));
	});

	var newOrder = function (data) {
		queryRequest('EXEC	[dbo].[InsertOrderWithParamsRDispatcher] @adres = N\'\', @enadres = N\'\',@phone = N\'\',@disp_id = -1, @status = 0, @color_check = 0, @op_order = 0, @gsm_detect_code = 0,@deny_duplicate = 0, @colored_new = 0, @ab_num = N\'\', @client_id = -1, @ord_num = 0,@order_id = 0',
						function (recordset) {
							emitData('orders');
						},
						function (err) {
						},
						connection);
		/*if (reqTimeout <= 0 || true) {
			stReqTimeout = 0;
		} else
			socket.emit('req_decline', {status: "many_new_order_req"});
		reqTimeout = 60;*/
	};

	socket.on('order', function (data) {
		console.log(data);
		console.log("=======");
		console.log(typeof data);
		if (typeof data === 'string') {
			tp = tryParseJSON(data);
			console.log("=======");
			console.log(tp);
			if (tp)
				data = tp;
		}

		var counter = 0,
			setPhrase = '',
			wherePhrase = ' WHERE BOLD_ID = ';
		for (i in data) {
			if (counter > 0) {
				setPhrase += (counter == 1 ? ' ' : ', ') + i + '=' +
					((typeof data[i] === 'string') ? '\'' + data[i] + '\'' : data[i]);
			} else {
				wherePhrase += data[i];
			}
			counter++;
		}

		console.log(setPhrase);
		setPhrase.length && queryRequest('UPDATE Zakaz SET ' + setPhrase + wherePhrase,
			function (recordset) {
				if (recordset && recordset.recordset &&
					recordset.recordset.length) {
					//emitData('orders');
				}
				emitData('orders');
			},
			function (err) {
				console.log('UPDATE Zakaz SET ' + setPhrase + wherePhrase);
				emitData('orders');
			},
			connection);
	});

	socket.on('disconnect', function () {
		socketsParams[socket.id] = {};
		console.log('user disconnected');
		clientsCount--;
	});
});