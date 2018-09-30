(function(angular) {
	'use strict';
	function DriversMapController($scope, $element, $attrs, injectedSocket, ascInterface) {
		var ctrl = this,
			icons = {},
			markers = {},
			orders = {},
			orderIcons = {};

		ctrl.list = [];
		ctrl.userId = -1;
		
		//L.sm.apiKey = '<Ваш API-ключ>';
		var map = L.sm.map('map1', {
			center: [44.878773, 37.314388],
			zoom: 14
		});
			
		/*var myIcon3 = L.icon({ // создаем иконку
			iconUrl: '//maps-js.apissputnik.ru/v0.3/images/marker-icon.png'
		});
			
		//44.878773, 37.314388 55.85, 37.61
		var myMarker30 = L.sm.marker([55.85, 37.61], {
			icon: myIcon3 // передаем иконку маркеру
		});
			
		var myIcon4 = L.icon({ // создаем иконку
			iconUrl: '//maps-js.apissputnik.ru/v0.3/images/marker-icon.png'
		});

		var myMarker40 = L.sm.marker([55.75, 37.51], {
			icon: myIcon4 // передаем иконку маркеру
		});

		myMarker30.addTo(map); // добавляем маркер на карту
			
		setTimeout(step1, 5000);
		//setTimeout('myMarker30.setLatLng([56.05, 37.81]);', 2000);
		//setTimeout('myMarker30.setLatLng([56.15, 37.91]);', 2000);
			
		function step1() {
			myMarker30.setLatLng([55.95, 37.71]); myMarker30.addTo(map); myMarker40.addTo(map);
		}*/

		injectedSocket.on('drivers', function (data) {
			var driverLat, driverLon, marker;
			ctrl.list = data.drivers;
			ctrl.userId = data.userId;
			
			ctrl.list.forEach(function(driver) {
				driverLat = driver.last_lat;
				driverLon = driver.last_lon;

				if (driverLat && driverLon) {
					if (!icons[driver.id]) {
						icons[driver.id] = L.icon({ // создаем иконку
							iconUrl: driver.Zanyat_drugim_disp ? '/images/car_red.png' : '/images/car_green.png',
							iconSize: [25, 25],
							iconType: driver.Zanyat_drugim_disp ? 'alt2' : 'alt3'
						});
					}

					if (!markers[driver.id]) {
						markers[driver.id] = L.sm.marker([driverLat, driverLon], {
							icon: icons[driver.id], // передаем иконку маркеру
							title: '' + driver.Pozyvnoi,
							iconClassName: 'icon-w12h20',
							iconType: driver.Zanyat_drugim_disp ? 'alt2' : 'alt3'
						});
						markers[driver.id].bindPopup('' + driver.Pozyvnoi);
					} else {
						markers[driver.id].setLatLng([driverLat, driverLon]);
					}
					
					markers[driver.id].addTo(map);
					
					//if (!markers[driver.id].isPopupOpen()) {
					//	markers[driver.id].togglePopup();
					//}
					
					markers[driver.id].openPopup(markers[driver.id].getLatLng());
				}
			});
		});
		
		injectedSocket.on('orders_coordinates', function (data) {
			var orderLat, orderLon, marker;
			//ctrl.list = data.drivers;
			//ctrl.userId = data.userId;
			
			data.orders.forEach(function(order) {
				orderLat = order.lat;
				orderLon = order.lon;

				if (orderLat && orderLon) {
					if (!orderIcons[order.id]) {
						orderIcons[order.id] = L.icon({ // создаем иконку
							iconUrl: '/images/man.png',
							iconSize: [25, 25]
						});
					}

					if (!orders[order.id]) {
						orders[order.id] = L.sm.marker([orderLat, orderLon], {
							icon: orderIcons[order.id], // передаем иконку маркеру
							title: '' + order.addr
						});
						orders[order.id].bindPopup('' + order.addr);
					} else {
						orders[order.id].setLatLng([orderLat, orderLon]);
					}
					
					orders[order.id].addTo(map);
					
					orders[order.id].openPopup(orders[order.id].getLatLng());
				}
			});
		});
	
		/*this.state = ascInterface.state;
		//this.elAction = function() {
		//	ascInterface.state.call(ctrl, event);
		//};

		ctrl.updateHero = function(hero, prop, value) {
			hero[prop] = value;
		};

		ctrl.deleteHero = function(hero) {
			var idx = ctrl.list.indexOf(hero);
			if (idx >= 0) {
				ctrl.list.splice(idx, 1);
			}
		};*/
	}

	angular.module('gemStore')
		.component('driversMap', {
			templateUrl: 'driversMap.html',
			controller: DriversMapController,
			bindings: {
				userId: '@?'
			}
		});
})(window.angular);
