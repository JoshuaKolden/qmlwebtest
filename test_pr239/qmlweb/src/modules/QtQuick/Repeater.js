function QMLRepeater(meta) {
    callSuper(this, meta);
    var self = this;
    var QMLListModel = getConstructor('QtQuick', '2.0', 'ListModel');

    this.parent = meta.parent; // TODO: some (all ?) of the components including Repeater needs to know own parent at creation time. Please consider this major change.

    createProperty("Component", this, "delegate");
    this.container = function() { return this.parent; }
    this.$defaultProperty = "delegate";
    createProperty("variant", this, "model", {initialValue: 0});
    createProperty("int", this, "count");
    this.$completed = false;
    this.$items = []; // List of created items
    this._childrenInserted = Signal();

    this.modelChanged.connect(applyModel);
    this.delegateChanged.connect(applyModel);
    this.parentChanged.connect(applyModel);

    this.itemAt = function(index) {
        return this.$items[index];
    }

    function callOnCompleted(child) {
        child.Component.completed();
        for (var i = 0; i < child.$tidyupList.length; i++)
            if (child.$tidyupList[i] instanceof QMLBaseObject)
                callOnCompleted(child.$tidyupList[i]);
    }
    function insertChildren(startIndex, endIndex) {
        if (endIndex <= 0) return;

        var model = self.model instanceof QMLListModel ? self.model.$model : self.model;

        for (var index = startIndex; index < endIndex; index++) {
            var newItem = self.delegate.createObject();
            createProperty('int', newItem, 'index', {initialValue: index});
            newItem.parent = self.parent;
            self.delegate.finalizeImports(); // To properly import JavaScript in the context of a component

            if ( typeof model == "number" || model instanceof Array ) {
                 if (typeof newItem.$properties["modelData"] == 'undefined'){
                    createProperty("variant", newItem, "modelData");
                 }
                 var value = model instanceof Array ? model[index] : typeof model == "number" ? index : "undefined";
                 newItem.$properties["modelData"].set(value, true, newItem, model.$context);
            } else {
                for (var i = 0; i < model.roleNames.length; i++) {
                    var roleName = model.roleNames[i];
                    if (typeof newItem.$properties[roleName] == 'undefined')
                      createProperty("variant", newItem, roleName);
                    newItem.$properties[roleName].set(model.data(index, roleName), true, newItem, self.model.$context);
                }
            }

            self.$items.splice(index, 0, newItem);

            // TODO debug this. Without check to Init, Completed sometimes called twice.. But is this check correct?
            if (engine.operationState !== QMLOperationState.Init && engine.operationState !== QMLOperationState.Idle) {
                // We don't call those on first creation, as they will be called
                // by the regular creation-procedures at the right time.
                callOnCompleted(newItem);
            }
        }
        if (engine.operationState !== QMLOperationState.Init) {
             // We don't call those on first creation, as they will be called
             // by the regular creation-procedures at the right time.
             engine.$initializePropertyBindings();
        }

        if (index > 0) {
            self.container().childrenChanged();
        }

        for (var i = endIndex; i < self.$items.length; i++)
            self.$items[i].index = i;

        self.count = self.$items.length;
    }

    function onModelDataChanged(startIndex, endIndex, roles) {
        var model = self.model instanceof QMLListModel ? self.model.$model : self.model;

        if (!roles)
            roles = model.roleNames;
        for (var index = startIndex; index <= endIndex; index++) {
            for (var i in roles) {
                self.$items[index].$properties[roles[i]].set(model.data(index, roles[i]), QMLProperty.ReasonInit, self.$items[index], self.model.$context);
            }
        }
    }
    function onRowsMoved(sourceStartIndex, sourceEndIndex, destinationIndex) {
        var vals = self.$items.splice(sourceStartIndex, sourceEndIndex-sourceStartIndex);
        for (var i = 0; i < vals.length; i++) {
            self.$items.splice(destinationIndex + i, 0, vals[i]);
        }
        var smallestChangedIndex = sourceStartIndex < destinationIndex
                                ? sourceStartIndex : destinationIndex;
        for (var i = smallestChangedIndex; i < self.$items.length; i++) {
            self.$items[i].index = i;
        }
    }
    function onRowsRemoved(startIndex, endIndex) {
        removeChildren(startIndex, endIndex);
        for (var i = startIndex; i < self.$items.length; i++) {
            self.$items[i].index = i;
        }
        self.count = self.$items.length;
    }
    function onModelReset() {
        var model = self.model instanceof QMLListModel ? self.model.$model : self.model;
        removeChildren(0, self.$items.length);
    }
    function applyModel() {
        if (!self.delegate || !self.parent)
            return;
        var model = self.model instanceof QMLListModel ? self.model.$model : self.model;
        if (model instanceof JSItemModel) {
            if ( model.dataChanged.isConnected(onModelDataChanged) == false ) model.dataChanged.connect(onModelDataChanged);
            if ( model.rowsInserted.isConnected(insertChildren) == false ) model.rowsInserted.connect(insertChildren);
            if ( model.rowsMoved.isConnected(onRowsMoved) == false  ) model.rowsMoved.connect(onRowsMoved);
            if ( model.rowsRemoved.isConnected(onRowsRemoved) == false  ) model.rowsRemoved.connect(onRowsRemoved);
            if ( model.modelReset.isConnected(onModelReset) == false  ) model.modelReset.connect(onModelReset);

            removeChildren(0, self.$items.length);
            insertChildren(0, model.rowCount());
        } else if (typeof model == "number") {
            // must be more elegant here.. do not delete already created models..
            //removeChildren(0, self.$items.length);
            //insertChildren(0, model);

            if (self.$items.length > model) {
               // have more than we need
               removeChildren(model,self.$items.length);
            }
            else
            {
               // need more
               insertChildren(self.$items.length,model);
            }

        } else if (model instanceof Array) {
            removeChildren(0, self.$items.length);
            insertChildren(0, model.length);
        }
    }

    function removeChildren(startIndex, endIndex) {
        var removed = self.$items.splice(startIndex, endIndex - startIndex);
        for (var index in removed) {
            removed[index].$delete();
            removeChildProperties(removed[index]);
        }
    }
    function removeChildProperties(child) {
        engine.completedSignals.splice(engine.completedSignals.indexOf(child.Component.completed), 1);
        for (var i = 0; i < child.children.length; i++)
            removeChildProperties(child.children[i])
    }
}

registerQmlType({
  module:   'QtQuick',
  name:     'Repeater',
  versions: /.*/,
  baseClass: 'Item',
  constructor: QMLRepeater
});
