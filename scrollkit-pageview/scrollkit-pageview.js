'use strict';

var SKPageView = function(element) {
  var _isDragging = false;
  
  var $window = $(window['addEventListener'] ? window : document.body);
  
  var $element = this.$element = $(element);
  element = this.element = $(element)[0];
  
  var pageView = element.pageView;
  if (pageView) return pageView;
  
  element.pageView = this;
  
  var self = this;
  
  // $element.bind('mousedown touchstart', function(evt) {
  //   
  // });
  
  // $window.bind('mousemove touchmove', function(evt) {
  //   
  // });
  
  // $window.bind('mouseup touchend', function(evt) {
  //   
  // });
};

SKPageView.prototype = {
  element: null,
  $element: null
};

var SKPage = function(element) {
  
};

SKPage.prototype = {
  
};

$(function() {
  $('.sk-page-view').each(function(index, element) { new SKPageView(element); });
});
