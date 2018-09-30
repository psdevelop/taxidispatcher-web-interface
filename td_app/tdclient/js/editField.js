(function(angular) {
  'use strict';
function EditFieldController($scope, $element, $attrs, ascInterface) {
	var ctrl = this;
	ctrl.editMode = false;
  
	ctrl.keyPress = function(event) {
		if ((event.which || event.keyCode)  === 13) {
			if (ctrl.editMode) {
				ctrl.handleModeChange();
				ascInterface.state.call(ctrl, event);
			}
		}
	};

  ctrl.handleModeChange = function() {
    if (ctrl.editMode) {
      ctrl.onUpdate({value: ctrl.fieldValue});
      ctrl.fieldValueCopy = ctrl.fieldValue;
    }
    ctrl.editMode = !ctrl.editMode;
  };

  ctrl.reset = function() {
    ctrl.fieldValue = ctrl.fieldValueCopy;
  };

  ctrl.$onInit = function() {
    // Make a copy of the initial value to be able to reset it later
    ctrl.fieldValueCopy = ctrl.fieldValue;

    // Set a default fieldType
    if (!ctrl.fieldType) {
      ctrl.fieldType = 'text';
    }
  };
}

angular.module('gemStore').component('editField', {
  templateUrl: 'editField.html',
  controller: EditFieldController,
  bindings: {
    fieldValue: '<',
    fieldType: '@?',
	fieldName: '@?',
	fieldId: '@?',
    onUpdate: '&'
  }
});
})(window.angular);

/*
Copyright 2018 Google Inc. All Rights Reserved.
Use of this source code is governed by an MIT-style license that
can be found in the LICENSE file at http://angular.io/license
*/