// View.js

var View = (function() {
  var instance;

  function View() {
    this.getMainWrapper = function() {
      var element = document.getElementsByClassName('main-wrapper')[0];
      if (!element) {
        console.warn('Main wrapper not found. Creating a new one.');
        element = document.createElement('div');
        element.className = 'main-wrapper';
        document.body.appendChild(element);
      }
      return element;
    };

    this.create = function(elementName) {
      if (typeof elementName !== 'string' || !elementName) {
        console.error('Invalid element name:', elementName);
        return null;
      }
      var element = document.createElement(elementName);
      return element;
    };

    this.addClass = function(element, className) {
      if (!element || !(element instanceof HTMLElement)) {
        console.error('Invalid element for addClass:', element);
        return;
      }
      if (typeof className === 'string') {
        element.className = className;
      } else {
        console.error('Invalid className:', className);
      }
    };

    this.append = function(parentElement, childElement) {
      if (!parentElement || !childElement || !(parentElement instanceof HTMLElement) || !(childElement instanceof HTMLElement)) {
        console.error('Invalid parent or child element:', { parentElement, childElement });
        return;
      }
      // Appends everything before the back button, score wrapper at top, and everything else in between
      if (childElement.className === 'score-wrapper') {
        parentElement.insertBefore(childElement, parentElement.firstChild);
      } else if (parentElement.lastChild && parentElement.lastChild.className === 'btn-wrapper') {
        parentElement.insertBefore(childElement, parentElement.lastChild);
      } else {
        parentElement.appendChild(childElement);
      }
    };

    this.appendToBody = function(childElement) {
      if (!childElement || !(childElement instanceof HTMLElement)) {
        console.error('Invalid child element for appendToBody:', childElement);
        return;
      }
      document.body.appendChild(childElement);
    };

    this.remove = function(parentElement, childElement) {
      if (!parentElement || !childElement || !(parentElement instanceof HTMLElement) || !(childElement instanceof HTMLElement)) {
        console.error('Invalid parent or child element for remove:', { parentElement, childElement });
        return;
      }
      if (parentElement.contains(childElement)) {
        parentElement.removeChild(childElement);
      }
    };

    this.removeFromBody = function(childElement) {
      if (!childElement || !(childElement instanceof HTMLElement)) {
        console.error('Invalid child element for removeFromBody:', childElement);
        return;
      }
      if (document.body.contains(childElement)) {
        document.body.removeChild(childElement);
      }
    };

    this.style = function(element, styles) {
      if (!element || !(element instanceof HTMLElement)) {
        console.error('Invalid element for style:', element);
        return;
      }
      if (!styles || typeof styles !== 'object') {
        console.error('Invalid styles object:', styles);
        return;
      }
      Object.assign(element.style, styles);
    };

    this.setHTML = function(element, content) {
      if (!element || !(element instanceof HTMLElement)) {
        console.error('Invalid element for setHTML:', element);
        return;
      }
      if (typeof content !== 'string') {
        console.error('Invalid content for setHTML:', content);
        return;
      }
      element.innerHTML = content;
    };
  }

  return {
    getInstance: function() {
      if (!instance) {
        instance = new View();
      }
      return instance;
    }
  };
})();