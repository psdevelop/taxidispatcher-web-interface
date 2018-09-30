(function(angular) {
	'use strict';
	function OrderListController($scope, $element, $attrs, injectedSocket, ascInterface) {
		var ctrl = this;

		ctrl.list = [];
		ctrl.userId = -1;
		injectedSocket.on('orders', function (data) {
			ctrl.list = data.orders;
			ctrl.userId = data.userId;
		});
		
		injectedSocket.on('abort_connection', function (data) {
			alert('Соединение закрыто! Сообщение: ' + data.msg)
		});
	
		this.state = ascInterface.state;
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
		};
	}

	angular.module('gemStore')
		.directive("orderTabs", function() {
			return {
				restrict: "E",
				templateUrl: "orderTabs.html",
				controller: function() {
					this.tab = 1;

					this.isSet = function(checkTab) {
						return this.tab === checkTab;
					};

					this.setTab = function(activeTab) {
						this.tab = activeTab;
					};
				},
				controllerAs: "tab"
			};
		})
		.directive("orderDescription", function() {
			return {
				restrict: 'E',
				templateUrl: "orderDescription.html"
			};
		})
		.directive("orderSpecs", function() {
			return {
				restrict:"A",
				templateUrl: "orderSpecs.html"
			};
		})
		.component('orderList', {
			templateUrl: 'orderList.html',
			controller: OrderListController,
			bindings: {
				userId: '@?'
			}
		});
})(window.angular);
