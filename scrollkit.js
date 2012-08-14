;'use strict';

// Polyfill for window.requestAnimationFrame and window.cancelAnimationFrame.
(function(){var a=0;var b=['webkit','moz','ms','o'];for(var c=0;c<b.length&&!window.requestAnimationFrame;c++){window.requestAnimationFrame=window[b[c]+'RequestAnimationFrame'];window.cancelAnimationFrame=window[b[c]+'CancelAnimationFrame']||window[b[c]+'RequestCancelAnimationFrame'];}if(!window.requestAnimationFrame){window.requestAnimationFrame=function(b,c){var d=Date['now']?Date.now():+(new Date());var e=Math.max(0,16-(d-a));var f=window.setTimeout(function(){b(d+e);},e);a=d+e;return f;};}if(!window.cancelAnimationFrame){window.cancelAnimationFrame=function(a){window.clearTimeout(a);};}})();

// The base ScrollKit object.
var ScrollKit = window['ScrollKit'] || {};

ScrollKit.Params = {
  bounceTransitionDuration: 0.3,
  accelerationTimeout: 250,
  acceleration: 20,
  elasticDeceleration: 0.03,
  elasticAcceleration: 0.18,
  minimumDecelerationVelocity: 1,
  decelerationFactor: 0.85,
  minimumVelocity: 0.01,
  minimumDeltaForScrollEvent: 0.5,
  minimumPageTurnVelocity: 5
};

/**
  
*/
ScrollKit.Util = {

  /**

  */
  getCoordinatesForEvent: function(evt, identifier) {
    if (evt.type.indexOf('mouse') !== -1) return { x: evt.pageX, y: evt.pageY };
    
    evt = evt.originalEvent;
    
    var touch = (identifier) ? this.getTouchWithIdentifier(evt.touches, identifier) : this.getTouchWithIdentifier(evt.targetTouches);
    return { x: touch.pageX, y: touch.pageY };
  },

  /**

  */
  getTouchWithIdentifier: function(touches, identifier) {
    if (touches.length === 0) return null;
    if (!identifier) return touches[0];

    for (var i = 0, length = touches.length, touch; i < length; i++) {
      if ((touch = touches[i]).identifier === identifier) return touch;
    }

    return null;
  },

  /**

  */
  getDeltaForCoordinates: function(coordA, coordB) {
    return { x: coordA.x - coordB.x, y: coordA.y - coordB.y };
  },

  /**

  */
  getVendorPrefix: function() {
    if ('result' in arguments.callee) return arguments.callee.result;

    var regExp = /^(Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/;
    var script = document.createElement('script');

    for (var prop in script.style) {
      if (regExp.test(prop)) return arguments.callee.result = prop.match(regExp)[0];
    }

    if ('WebkitOpacity' in script.style) return arguments.callee.result = 'Webkit';
    if ('KhtmlOpacity' in script.style) return arguments.callee.result = 'Khtml';

    return arguments.callee.result = '';
  }
};

/**

*/
ScrollKit.ScrollView = function ScrollView(element) {
  if (!element) return;
  
  var $element = this.$element = $(element);
  element = this.element = $element[0];
  
  var scrollView = element.scrollView;
  if (scrollView) return scrollView;
  
  var self = element.scrollView = this;

  var Params = ScrollKit.Params;
  var Util = ScrollKit.Util;
  
  var $window = $(window['addEventListener'] ? window : document.body);

  var $content = this.$content = $('<div class="sk-scroll-content"/>').append($element.contents()).appendTo($element);
  var $horizontalScrollIndicator = this.$horizontalScrollIndicator = $('<div class="sk-scroll-indicator sk-hidden" style="bottom: 0; left: 0;"/>').appendTo($element);
  var $verticalScrollIndicator = this.$verticalScrollIndicator = $('<div class="sk-scroll-indicator sk-hidden" style="top: 0; right: 0;"/>').appendTo($element);
  
  var alwaysBounceHorizontal = $element.attr('data-always-bounce-horizontal') || 'false';
  alwaysBounceHorizontal = this._alwaysBounceHorizontal = alwaysBounceHorizontal !== 'false';

  var alwaysBounceVertical = $element.attr('data-always-bounce-vertical') || 'false';
  alwaysBounceVertical = this._alwaysBounceVertical = alwaysBounceVertical !== 'false';
  
  var alwaysHideHorizontalScrollIndicator = this._alwaysHideHorizontalScrollIndicator = $element.attr('data-always-hide-horizontal-scroll-indicator') || 'false';
  alwaysHideHorizontalScrollIndicator = this._alwaysHideHorizontalScrollIndicator = alwaysHideHorizontalScrollIndicator !== 'false';
  
  var alwaysHideVerticalScrollIndicator = this._alwaysHideVerticalScrollIndicator = $element.attr('data-always-hide-vertical-scroll-indicator') || 'false';
  alwaysHideVerticalScrollIndicator = this._alwaysHideVerticalScrollIndicator = alwaysHideVerticalScrollIndicator !== 'false';
  
  var pagingEnabled = $element.attr('data-paging-enabled') || 'false';
  pagingEnabled = this._pagingEnabled = pagingEnabled !== 'false';

  var useMouseDragScrolling = $element.attr('data-use-mouse-drag-scrolling') || 'false';
  useMouseDragScrolling = this._useMouseDragScrolling = useMouseDragScrolling !== 'false';

  var size = this._size = { width: 0, height: 0 };
  var contentSize = this._contentSize = { width: 0, height: 0 };
  var margin = this._margin = { top: 0, right: 0, bottom: 0, left: 0 };
  var scrollPosition = this._scrollPosition = { x: 0, y: 0 };
  var maximumScrollPosition = this._maximumScrollPosition = { x: 0, y: 0 };
  var pageIndexes = this._pageIndexes = { horizontal: 0, vertical: 0 };

  this.recalculateDimensions();

  var isTouchSupported = !!('ontouchstart' in window);
  if (!isTouchSupported && !useMouseDragScrolling) {
    $element.css('overflow', 'auto');
    $element.bind('scroll', function(evt) {
      scrollPosition.x = this.scrollLeft;
      scrollPosition.y = this.scrollTop;
    });

    return this;
  }
  
  else if (isTouchSupported) {
    useMouseDragScrolling = this._useMouseDragScrolling = true;
  }

  var isDragging = false;
  var lastTouchPosition = null;
  var lastTouchIdentifier = null;
  
  var startAccelerateTimeStamp = null;
  var startAccelerateScrollPosition = null;
  var isDecelerating = false;
  var decelerationAnimationInterval = null;

  var resetStartAccelerate = function(timeStamp) {
    startAccelerateTimeStamp = timeStamp;
    startAccelerateScrollPosition = {
      x: scrollPosition.x,
      y: scrollPosition.y
    };
  };
  
  var startDeceleration = function(startTimeStamp) {
    var shouldScrollHorizontal = self.getShouldScrollHorizontal();
    var shouldScrollVertical = self.getShouldScrollVertical();
    var acceleration = (startAccelerateTimeStamp - startTimeStamp) / Params.acceleration;
    var accelerateDelta = Util.getDeltaForCoordinates(scrollPosition, startAccelerateScrollPosition);
    var velocity = {
      x: accelerateDelta.x / acceleration,
      y: accelerateDelta.y / acceleration
    };
    
    var stepAnimation = function (currentFrameTimeStamp) {
      if (!isDecelerating) return;
      
      var animationDelta = {
        x: (shouldScrollHorizontal ? velocity.x : 0),
        y: (shouldScrollVertical   ? velocity.y : 0)
      };
      
      velocity.x *= Params.decelerationFactor;
      velocity.y *= Params.decelerationFactor;
      
      if (Math.abs(velocity.x) <= Params.minimumVelocity && Math.abs(velocity.y) <= Params.minimumVelocity) {
        stopDeceleration();
        stopScroll();
        return;
      }
      
      self.setScrollPosition(scrollPosition.x - velocity.x, scrollPosition.y - velocity.y);
      
      decelerationAnimationInterval = window.requestAnimationFrame(stepAnimation);
      
      if (self.getIsScrollPositionInBounds()) return;
      
      var elastic = {
        x: (scrollPosition.x < 0) ? scrollPosition.x : (scrollPosition.x > maximumScrollPosition.x) ? scrollPosition.x - maximumScrollPosition.x : 0,
        y: (scrollPosition.y < 0) ? scrollPosition.y : (scrollPosition.y > maximumScrollPosition.y) ? scrollPosition.y - maximumScrollPosition.y : 0
      };
      
      if (elastic.x) velocity.x = (elastic.x * velocity.x <= 0) ? velocity.x + (elastic.x * Params.elasticDeceleration) : elastic.x * Params.elasticAcceleration;
      if (elastic.y) velocity.y = (elastic.y * velocity.y <= 0) ? velocity.y + (elastic.y * Params.elasticDeceleration) : elastic.y * Params.elasticAcceleration;
    };
    
    if (Math.abs(velocity.x) > Params.minimumDecelerationVelocity || Math.abs(velocity.y) > Params.minimumDecelerationVelocity) {
      isDecelerating = true;
      decelerationAnimationInterval = window.requestAnimationFrame(stepAnimation);
    } else {
      self.bounceScrollPositionInBounds();
      stopScroll();
    }
  };
  
  var stopDeceleration = function() {
    if (!isDecelerating) return;
    
    isDecelerating = false;
    window.cancelAnimationFrame(decelerationAnimationInterval);
  };
  
  var snapToPage = function(startTimeStamp) {
    var acceleration = (startAccelerateTimeStamp - startTimeStamp) / Params.acceleration;
    var accelerateDelta = Util.getDeltaForCoordinates(scrollPosition, startAccelerateScrollPosition);
    var velocity = {
      x: accelerateDelta.x / acceleration,
      y: accelerateDelta.y / acceleration
    };
    
    var pageCounts = self.getPageCounts();
    var currentPageIndexes = {
      horizontal: Math.round(scrollPosition.x / size.width),
      vertical: Math.round(scrollPosition.y / size.height)
    };
    
    if (currentPageIndexes.horizontal === pageIndexes.horizontal && Math.abs(velocity.x) > Params.minimumPageTurnVelocity) currentPageIndexes.horizontal += (velocity.x > 0) ? -1 : 1;
    if (currentPageIndexes.vertical === pageIndexes.vertical && Math.abs(velocity.y) > Params.minimumPageTurnVelocity) currentPageIndexes.vertical += (velocity.y > 0) ? -1 : 1;
  
    currentPageIndexes.horizontal = Math.min(Math.max(0, currentPageIndexes.horizontal), pageCounts.horizontal - 1);
    currentPageIndexes.vertical = Math.min(Math.max(0, currentPageIndexes.vertical), pageCounts.vertical - 1);
    
    self.setPageIndexes(currentPageIndexes.horizontal, currentPageIndexes.vertical);
  };
  
  var startScroll = function() {
    if (self._scrolling) return;
    self._scrolling = true;
    
    self.setHorizontalScrollIndicatorHidden(false);
    self.setVerticalScrollIndicatorHidden(false);
    $element.trigger(ScrollKit.ScrollView.EventType.ScrollStart);
  };
  
  var stopScroll = function() {
    if (!self._scrolling) return;
    self._scrolling = false;
    
    var roundedScrollPosition = {
      x: Math.round(scrollPosition.x),
      y: Math.round(scrollPosition.y)
    };
    
    self.setHorizontalScrollIndicatorHidden(true);
    self.setVerticalScrollIndicatorHidden(true);
    
    if (scrollPosition.x !== roundedScrollPosition.x || scrollPosition.y !== roundedScrollPosition.y) {
      self.setScrollPosition(Math.round(scrollPosition.x), Math.round(scrollPosition.y));
    }
    
    $element.trigger(ScrollKit.ScrollView.EventType.ScrollStop);
  };

  $element.bind(isTouchSupported ? 'touchstart' : 'mousedown', function(evt) {
    if (isDragging) return;

    isDragging = true;
    lastTouchPosition = Util.getCoordinatesForEvent(evt);
    lastTouchIdentifier = (isTouchSupported) ? evt.originalEvent.targetTouches[0].identifier : null;
    
    stopDeceleration();
    resetStartAccelerate(evt.timeStamp);

    self.recalculateDimensions();

    $window.bind(isTouchSupported ? 'touchmove' : 'mousemove', touchMoveHandler);
    $window.bind(isTouchSupported ? 'touchend' : 'mouseup', touchEndHandler);
  });

  var touchMoveHandler = function(evt) {
    evt.preventDefault();
    
    if (!isDragging) return;
    
    if (!self._scrolling) startScroll();

    var touchPosition = Util.getCoordinatesForEvent(evt, lastTouchIdentifier);
    var touchDelta = Util.getDeltaForCoordinates(touchPosition, lastTouchPosition);
    
    if (!self.getIsScrollPositionInBounds()) {
      touchDelta.x /= 2;
      touchDelta.y /= 2;
    }
    
    self.setScrollPosition(scrollPosition.x - touchDelta.x, scrollPosition.y - touchDelta.y);

    var timeStamp = evt.timeStamp;
    var accelerationTime = timeStamp - startAccelerateTimeStamp;
    if (accelerationTime > Params.accelerationTimeout) resetStartAccelerate(timeStamp);

    lastTouchPosition = touchPosition;
  };

  var touchEndHandler = function(evt) {
    if (!isDragging) return;

    isDragging = false;
    lastTouchIdentifier = null;

    $window.unbind(isTouchSupported ? 'touchmove' : 'mousemove', touchMoveHandler);
    $window.unbind(isTouchSupported ? 'touchend' : 'mouseup', touchEndHandler);

    var timeStamp = evt.timeStamp;
    var accelerationTime = timeStamp - startAccelerateTimeStamp;
    
    if (self._pagingEnabled) {
      snapToPage(timeStamp);
      stopScroll();
    }
    
    else if (accelerationTime < Params.accelerationTimeout) {
      startDeceleration(timeStamp);
    }
    
    else if (!self.getIsScrollPositionInBounds()) {
      self.bounceScrollPositionInBounds();
      stopScroll();
    }
    
    else {
      stopScroll();
    }
  };
};

/**
  Event types for ScrollKit.ScrollView.
*/
ScrollKit.ScrollView.EventType = {
  ScrollStart: 'ScrollKit:ScrollView:ScrollStart',
  ScrollStop: 'ScrollKit:ScrollView:ScrollStop',
  WillScrollToTop: 'ScrollKit:ScrollView:WillScrollToTop',
  DidScrollToTop: 'ScrollKit:ScrollView:DidScrollToTop',
  PageChanged: 'ScrollKit:ScrollView:PageChanged',
  DidPullToRefresh: 'ScrollKit:ScrollView:DidPullToRefresh'
};

ScrollKit.ScrollView.prototype = {
  constructor: ScrollKit.ScrollView,
  
  element: null,
  $element: null,
  $content: null,
  $horizontalScrollIndicator: null,
  $verticalScrollIndicator: null,

  _useMouseDragScrolling: false,
  _vendorPrefix: ScrollKit.Util.getVendorPrefix().toLowerCase(),

  _scrolling: false,
  
  /**
  
  */
  getScrolling: function() { return this._scrolling; },

  _alwaysBounceHorizontal: false,

  /**

  */
  getAlwaysBounceHorizontal: function() { return this._alwaysBounceHorizontal; },
  
  /**

  */
  setAlwaysBounceHorizontal: function(alwaysBounceHorizontal) { this._alwaysBounceHorizontal = alwaysBounceHorizontal; },

  /**

  */
  getShouldScrollHorizontal: function() { return this._alwaysBounceHorizontal || this._contentSize.width > this._size.width; },

  _alwaysBounceVertical: false,
  
  /**

  */
  getAlwaysBounceVertical: function() { return this._alwaysBounceVertical; },
  
  /**

  */
  setAlwaysBounceVertical: function(alwaysBounceVertical) { this._alwaysBounceVertical = alwaysBounceVertical; },
  
  /**

  */
  getShouldScrollVertical: function() { return this._alwaysBounceVertical || this._contentSize.height > this._size.height; },

  _alwaysHideHorizontalScrollIndicator: false,
  
  /**
  
  */
  getAlwaysHideHorizontalScrollIndicator: function() { return this._alwaysHideHorizontalScrollIndicator; },
  
  /**
  
  */
  setAlwaysHideHorizontalScrollIndicator: function(alwaysHideHorizontalScrollIndicator) { this._alwaysHideHorizontalScrollIndicator = alwaysHideHorizontalScrollIndicator; },

  _alwaysHideVerticalScrollIndicator: false,
  
  /**
  
  */
  getAlwaysHideVerticalScrollIndicator: function() { return this._alwaysHideVerticalScrollIndicator; },
  
  /**
  
  */
  setAlwaysHideVerticalScrollIndicator: function(alwaysHideVerticalScrollIndicator) { this._alwaysHideVerticalScrollIndicator = alwaysHideVerticalScrollIndicator; },

  _pagingEnabled: false,
  
  /**
  
  */
  getPagingEnabled: function() { return this._pagingEnabled; },
  
  /**
  
  */
  setPagingEnabled: function(pagingEnabled) { this._pagingEnabled = pagingEnabled; },
  
  _pageIndexes: null, // { horizontal: 0, vertical: 0 }
  
  /**
  
  */
  getPageIndexes: function() { return this._pageIndexes; },
  
  /**
  
  */
  setPageIndexes: function(horizontalPageIndex, verticalPageIndex) {
    var pageIndexes = this._pageIndexes;
    var size = this._size;
    
    var previousIndexes = {
      horizontal: pageIndexes.horizontal,
      vertical: pageIndexes.vertical
    };
    
    pageIndexes.horizontal = horizontalPageIndex;
    pageIndexes.vertical = verticalPageIndex;
    
    this.setScrollPosition(horizontalPageIndex * size.width, verticalPageIndex * size.height, ScrollKit.Params.bounceTransitionDuration);
    
    if (horizontalPageIndex !== previousIndexes.horizontal || verticalPageIndex !== previousIndexes.vertical) {
      this.$element.trigger($.Event(ScrollKit.ScrollView.EventType.PageChanged, {
        previousIndexes: previousIndexes,
        currentIndexes: {
          horizontal: horizontalPageIndex,
          vertical: verticalPageIndex
        }
      }));
    }
  },
  
  /**
  
  */
  getPageCounts: function() {
    var contentSize = this._contentSize;
    var size = this._size;
    var pageCounts = {
      horizontal: Math.floor(contentSize.width / size.width),
      vertical: Math.floor(contentSize.height / size.height)
    };
    
    return pageCounts;
  },

  _minimumHorizontalScrollIndicatorLength: 12,
  
  /**
  
  */
  getMinimumHorizontalScrollIndicatorLength: function() { return this._minimumHorizontalScrollIndicatorLength; },
  
  /**
  
  */
  setMinimumHorizontalScrollIndicatorLength: function(minimumHorizontalScrollIndicatorLength) {
    this._minimumHorizontalScrollIndicatorLength = minimumHorizontalScrollIndicatorLength;
    this.updateHorizontalScrollIndicator();
  },
  
  _horizontalScrollIndicatorThickness: 7,
  
  /**
  
  */
  getHorizontalScrollIndicatorThickness: function() { return this._horizontalScrollIndicatorThickness; },
  
  /**
  
  */
  setHorizontalScrollIndicatorThickness: function(horizontalScrollIndicatorThickness) {
    this._horizontalScrollIndicatorThickness = horizontalScrollIndicatorThickness;
    this.updateHorizontalScrollIndicator();
  },
  
  _horizontalScrollIndicatorHidden: true,
  
  /**
  
  */
  getHorizontalScrollIndicatorHidden: function() { return this._horizontalScrollIndicatorHidden; },
  
  /**
  
  */
  setHorizontalScrollIndicatorHidden: function(horizontalScrollIndicatorHidden) {
    this._horizontalScrollIndicatorHidden = horizontalScrollIndicatorHidden;
    
    if (horizontalScrollIndicatorHidden || this._alwaysHideHorizontalScrollIndicator || !this.getShouldScrollHorizontal()) {
      this.$horizontalScrollIndicator.addClass('sk-hidden');
    } else {
      this.$horizontalScrollIndicator.removeClass('sk-hidden');
    }
  },
  
  /**
  
  */
  updateHorizontalScrollIndicator: function() {
    if (this._horizontalScrollIndicatorHidden) return;
    
    var scrollPosition = this._scrollPosition.x;
    var size = this._size.width;
    var contentSize = this._contentSize.width;
    var maximumScrollPosition = this._maximumScrollPosition.x;
    var minimumScrollIndicatorLength = this._minimumHorizontalScrollIndicatorLength;
    var scrollIndicatorThickness = this._horizontalScrollIndicatorThickness;
    var scrollIndicatorMargin = this.getShouldScrollVertical() ? scrollIndicatorThickness * 2 : scrollIndicatorThickness - 2;
    var scrollIndicatorLength = Math.max(minimumScrollIndicatorLength, (size / contentSize) * (size - scrollIndicatorMargin));
    var scrollIndicatorPosition = (scrollPosition / maximumScrollPosition) * (size - scrollIndicatorMargin - scrollIndicatorLength);
    
    if (scrollPosition <= 0) {
      scrollIndicatorLength = Math.max(scrollIndicatorThickness - 2, scrollPosition + scrollIndicatorLength);
      scrollIndicatorPosition = 0;
    }
    
    else if (scrollPosition >= maximumScrollPosition) {
      scrollIndicatorLength = Math.max(scrollIndicatorThickness - 2, (maximumScrollPosition - scrollPosition) + scrollIndicatorLength);
      scrollIndicatorPosition = size - scrollIndicatorLength - scrollIndicatorMargin;
    }
    
    var translation = scrollIndicatorPosition + 'px, 0';
    var vendorPrefix = this._vendorPrefix;
    var styles = this._horizontalScrollIndicatorStyles = this._horizontalScrollIndicatorStyles || {};

    styles['width'] = scrollIndicatorLength + 'px';

    // TODO: Change this test to look for 3D transform capability instead of Webkit only.
    if (vendorPrefix === 'webkit') {
      styles['-webkit-transform'] = styles['transform'] = 'translate3d(' + translation + ', 0)';
    }

    else {
      styles['-' + vendorPrefix + '-transform'] = styles['transform'] = 'translate(' + translation + ')';
    }

    this.$horizontalScrollIndicator.css(styles);
  },
  
  _minimumVerticalScrollIndicatorLength: 12,
  
  /**
  
  */
  getMinimumVerticalScrollIndicatorLength: function() { return this._minimumVerticalScrollIndicatorLength; },
  
  /**
  
  */
  setMinimumVerticalScrollIndicatorLength: function(minimumVerticalScrollIndicatorLength) {
    this._minimumVerticalScrollIndicatorLength = minimumVerticalScrollIndicatorLength;
    this.updateVerticalScrollIndicator();
  },
  
  _verticalScrollIndicatorThickness: 7,
  
  /**
  
  */
  getVerticalScrollIndicatorThickness: function() { return this._verticalScrollIndicatorThickness; },
  
  /**
  
  */
  setVerticalScrollIndicatorThickness: function(verticalScrollIndicatorThickness) {
    this._verticalScrollIndicatorThickness = verticalScrollIndicatorThickness;
    this.updateVerticalScrollIndicator();
  },
  
  _verticalScrollIndicatorHidden: true,
  
  /**
  
  */
  getVerticalScrollIndicatorHidden: function() { return this._verticalScrollIndicatorHidden; },
  
  /**
  
  */
  setVerticalScrollIndicatorHidden: function(verticalScrollIndicatorHidden) {
    this._verticalScrollIndicatorHidden = verticalScrollIndicatorHidden;
    
    if (verticalScrollIndicatorHidden || this._alwaysHideVerticalScrollIndicator || !this.getShouldScrollVertical()) {
      this.$verticalScrollIndicator.addClass('sk-hidden');
    } else {
      this.$verticalScrollIndicator.removeClass('sk-hidden');
    }
  },
  
  /**
  
  */
  updateVerticalScrollIndicator: function() {
    if (this._verticalScrollIndicatorHidden) return;
    
    var scrollPosition = this._scrollPosition.y;
    var size = this._size.height;
    var contentSize = this._contentSize.height;
    var maximumScrollPosition = this._maximumScrollPosition.y;
    var minimumScrollIndicatorLength = this._minimumVerticalScrollIndicatorLength;
    var scrollIndicatorThickness = this._verticalScrollIndicatorThickness;
    var scrollIndicatorMargin = this.getShouldScrollHorizontal() ? scrollIndicatorThickness * 2 : scrollIndicatorThickness - 2;
    var scrollIndicatorLength = Math.max(minimumScrollIndicatorLength, (size / contentSize) * (size - scrollIndicatorMargin));
    var scrollIndicatorPosition = (scrollPosition / maximumScrollPosition) * (size - scrollIndicatorMargin - scrollIndicatorLength);
    
    if (scrollPosition <= 0) {
      scrollIndicatorLength = Math.max(scrollIndicatorThickness - 2, scrollPosition + scrollIndicatorLength);
      scrollIndicatorPosition = 0;
    }
    
    else if (scrollPosition >= maximumScrollPosition) {
      scrollIndicatorLength = Math.max(scrollIndicatorThickness - 2, (maximumScrollPosition - scrollPosition) + scrollIndicatorLength);
      scrollIndicatorPosition = size - scrollIndicatorLength - scrollIndicatorMargin;
    }
    
    var translation = '0, ' + scrollIndicatorPosition + 'px';
    var vendorPrefix = this._vendorPrefix;
    var styles = this._verticalScrollIndicatorStyles = this._verticalScrollIndicatorStyles || {};

    styles['height'] = scrollIndicatorLength + 'px';

    // TODO: Change this test to look for 3D transform capability instead of Webkit only.
    if (vendorPrefix === 'webkit') {
      styles['-webkit-transform'] = styles['transform'] = 'translate3d(' + translation + ', 0)';
    }

    else {
      styles['-' + vendorPrefix + '-transform'] = styles['transform'] = 'translate(' + translation + ')';
    }

    this.$verticalScrollIndicator.css(styles);
  },

  _size: null, // { width: 0, height: 0 }

  /**

  */
  getSize: function() { return this._size; },

  _contentSize: null, // { width: 0, height: 0 }

  /**

  */
  getContentSize: function() { return this._contentSize; },

  _margin: null, // { top: 0, right: 0, bottom: 0, left: 0 }
  
  /**
  
  */
  getMargin: function() { return this._margin; },
  
  /**
  
  */
  setMargin: function(marginTop, marginRight, marginBottom, marginLeft) {
    var scrollPosition = this._scrollPosition;
    var margin = this._margin;
    margin.top = (marginTop !== 0) ? (marginTop || margin.top) : 0;
    margin.right = (marginRight !== 0) ? (marginRight || margin.right) : 0;
    margin.bottom = (marginBottom !== 0) ? (marginBottom || margin.bottom) : 0;
    margin.left = (marginLeft !== 0) ? (marginLeft || margin.left) : 0;
    
    if (this._useMouseDragScrolling) {
      this.translate(scrollPosition.x, scrollPosition.y);
    } else {
      this.$content.css('padding', margin.top + 'px ' + margin.right + 'px ' + margin.bottom + 'px ' + margin.left + 'px');
    }
  },

  _scrollPosition: null, // { x: 0, y: 0 }

  /**

  */
  getScrollPosition: function() { return this._scrollPosition; },

  /**

  */
  setScrollPosition: function(x, y, animationDuration) {
    var scrollPosition = this._scrollPosition;
    var minimumDeltaForScrollEvent = ScrollKit.Params.minimumDeltaForScrollEvent;
    var shouldTriggerScrollEvent = (Math.abs(scrollPosition.x - x) > minimumDeltaForScrollEvent || Math.abs(scrollPosition.y - y) > minimumDeltaForScrollEvent);
    
    x = scrollPosition.x = (this.getShouldScrollHorizontal()) ? x : 0;
    y = scrollPosition.y = (this.getShouldScrollVertical()) ? y : 0;

    this.translate(x, y, animationDuration);
    
    if (!shouldTriggerScrollEvent) return;
    
    this.updateHorizontalScrollIndicator();
    this.updateVerticalScrollIndicator();
    
    this.$element.trigger('scroll');
  },
  
  /**
  
  */
  scrollToTop: function() {
    if (this._scrolling) return;
    
    var $element = this.$element;
    $element.trigger(ScrollKit.ScrollView.EventType.WillScrollToTop);
    
    var margin = this._margin;
    margin.bottom += margin.top;
    margin.top = 0;
    
    var bounceTransitionDuration = ScrollKit.Params.bounceTransitionDuration;
    
    if (!this._useMouseDragScrolling) {
      this.$content.css('padding', margin.top + 'px ' + margin.right + 'px ' + margin.bottom + 'px ' + margin.left + 'px');
      
      $element.animate({
        scrollTop: 0
      }, bounceTransitionDuration * 500, function() {
        $element.trigger(ScrollKit.ScrollView.EventType.DidScrollToTop);
      });
      
      return;
    }
    
    var scrollPosition = this._scrollPosition;
    scrollPosition.x = 0;
    scrollPosition.y = 0;
    
    this.setHorizontalScrollIndicatorHidden(false);
    this.setVerticalScrollIndicatorHidden(false);
    
    this.updateHorizontalScrollIndicator();
    this.updateVerticalScrollIndicator();
    
    this.setScrollPosition(0, 0, bounceTransitionDuration);

    var self = this;
    window.setTimeout(function() {
      self.setHorizontalScrollIndicatorHidden(true);
      self.setVerticalScrollIndicatorHidden(true);
      
      $element.trigger(ScrollKit.ScrollView.EventType.DidScrollToTop);
    }, bounceTransitionDuration * 250);
  },
  
  _maximumScrollPosition: null, // { x: 0, y: 0 }
  
  /**
  
  */
  getMaximumScrollPosition: function() { return this._maximumScrollPosition; },
  
  /**
  
  */
  getIsScrollPositionInBounds: function() {
    var scrollPosition = this._scrollPosition;
    var maximumScrollPosition = this._maximumScrollPosition;
    var clampedX = Math.min(Math.max(0, scrollPosition.x), maximumScrollPosition.x);
    var clampedY = Math.min(Math.max(0, scrollPosition.y), maximumScrollPosition.y);
    
    return (scrollPosition.x === clampedX && scrollPosition.y === clampedY);
  },
  
  /**
  
  */
  bounceScrollPositionInBounds: function() {
    var scrollPosition = this._scrollPosition;
    var maximumScrollPosition = this._maximumScrollPosition;
    var clampedX = Math.min(Math.max(0, scrollPosition.x), maximumScrollPosition.x);
    var clampedY = Math.min(Math.max(0, scrollPosition.y), maximumScrollPosition.y);
    
    this.setScrollPosition(clampedX, clampedY, ScrollKit.Params.bounceTransitionDuration);
  },

  _lastTransitionDuration: '0s',

  /**

  */
  translate: function(x, y, animationDuration) {
    var margin = this._margin;
    var translation = (margin.left - x) + 'px, ' + (margin.top - y) + 'px';
    var duration = (animationDuration || '0') + 's';
    var vendorPrefix = this._vendorPrefix;
    var styles = this._contentStyles = this._contentStyles || {};

    // TODO: Change this test to look for 3D transform capability instead of Webkit only.
    if (vendorPrefix === 'webkit') {
      if (duration !== this._lastTransitionDuration) this._lastTransitionDuration = styles['-webkit-transition-duration'] = styles['transition-duration'] = duration;
      styles['-webkit-transform'] = styles['transform'] = 'translate3d(' + translation + ', 0)';
    }

    else {
      if (duration !== this._lastTransitionDuration) this._lastTransitionDuration = styles['-' + vendorPrefix + '-transition-duration'] = styles['transition-duration'] = duration;
      styles['-' + vendorPrefix + '-transform'] = styles['transform'] = 'translate(' + translation + ')';
    }

    this.$content.css(styles);
  },
  
  /**
  
  */
  recalculateDimensions: function() {
    var $element = this.$element;
    var $content = this.$content;
    var size = this._size;
    var contentSize = this._contentSize;
    var margin = this._margin;
    var maximumScrollPosition = this._maximumScrollPosition;
    
    size.width = $element.width();
    size.height = $element.height();
    
    contentSize.width = $content.width() + margin.left + margin.right;
    contentSize.height = $content.height() + margin.top + margin.bottom;
    
    maximumScrollPosition.x = contentSize.width - size.width;
    maximumScrollPosition.y = contentSize.height - size.height;
  }
};

$(function() {
  $('.sk-scroll-view').each(function(index, element) { new ScrollKit.ScrollView(element); });

  // Set up horizontal page containers to automatically adjust their size when the window resizes.
  var $window = $(window['addEventListener'] ? window : document.body).bind('resize', function(evt) {
    resizePageContainers();
  });
  var $style = $('<style/>').appendTo($(document.head));
  var resizePageContainers = function() {
    $style.html('.sk-page-container-horizontal > li { width: ' + $window.width() + 'px !important; }');
  };
  
  resizePageContainers();
});
