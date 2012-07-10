;'use strict';

// Polyfill for window.requestAnimationFrame and window.cancelAnimationFrame.
(function(){var a=0;var b=['webkit','moz','ms','o'];for(var c=0;c<b.length&&!window.requestAnimationFrame;c++){window.requestAnimationFrame=window[b[c]+'RequestAnimationFrame'];window.cancelAnimationFrame=window[b[c]+'CancelAnimationFrame']||window[b[c]+'RequestCancelAnimationFrame']}if(!window.requestAnimationFrame){window.requestAnimationFrame=function(b,c){var d=Date['now']?Date.now():+(new Date);var e=Math.max(0,16-(d-a));var f=window.setTimeout(function(){b(d+e)},e);a=d+e;return f}}if(!window.cancelAnimationFrame){window.cancelAnimationFrame=function(a){window.clearTimeout(a)}}})();

// The base ScrollKit object.
var ScrollKit = window['ScrollKit'] || {};

/**
  Creates a new ScrollView.
  @param {HTMLDivElement} element The DIV element to initialize as a new ScrollView.
  @constructor
*/
ScrollKit.ScrollView = function ScrollView(element) {
  if (!element) return;
  
  var $element = this.$element = $(element);
  var element = this.element = $element[0];
  
  var scrollView = element.scrollView;
  if (scrollView) return scrollView;
  
  element.scrollView = this;
  
  var $window = $(window['addEventListener'] ? window : document.body);
  
  // Wrap the contents of the scroll view with a ScrollContent object.
  var $scrollContent = $('<div class="sk-scroll-content"/>').append($element.contents()).appendTo($element);  
  this.setScrollContent(new ScrollKit.ScrollContent($scrollContent, this));
  
  // Add the "pull to refresh" element above the scroll content element.
  var $pullToRefresh = this.$pullToRefresh = $('<div class="sk-pull-to-refresh sk-hidden"/>').appendTo($scrollContent);
  $pullToRefresh.append('<span class="sk-pull-to-refresh-message">Pull To Refresh</span>').append('<span class="sk-pull-to-refresh-arrow"/>');
  
  // Set the initial scroll offset.
  this._scrollOffset = { x: 0, y: 0 };
  
  // Add a horizontal and vertical scroll bars.
  var horizontalScrollBar = new ScrollKit.ScrollBar(this, ScrollKit.ScrollBar.ScrollBarType.Horizontal);
  this.setHorizontalScrollBar(horizontalScrollBar);
  
  var verticalScrollBar = new ScrollKit.ScrollBar(this, ScrollKit.ScrollBar.ScrollBarType.Vertical)
  this.setVerticalScrollBar(verticalScrollBar);
  
  // Determine if the scroll view should always bounce horizontally.
  var alwaysBounceHorizontal = $element.attr('data-always-bounce-horizontal') || 'false';
  this.setAlwaysBounceHorizontal(alwaysBounceHorizontal = alwaysBounceHorizontal !== 'false');
  
  // Determine if the scroll view should always bounce vertically.
  var alwaysBounceVertical = $element.attr('data-always-bounce-vertical') || 'false';
  this.setAlwaysBounceVertical(alwaysBounceVertical = alwaysBounceVertical !== 'false');
  
  // Determine if the scroll view has paging enabled.
  var pagingEnabled = $element.attr('data-paging-enabled') || 'false';
  this.setPagingEnabled(pagingEnabled = pagingEnabled !== 'false');
  
  // Determine if the scroll view has a "pull to refresh" area.
  var pullToRefresh = $element.attr('data-pull-to-refresh') || 'false';
  this.setPullToRefresh(pullToRefresh = pullToRefresh !== 'false');
  
  // Get values for the constants used for the scroll physics.
  var kBounceTransitionDuration = this.kBounceTransitionDuration;
  var kAccelerationTimeout = this.kAccelerationTimeout;
  var kAcceleration = this.kAcceleration;
  var kElasticDeceleration = this.kElasticDeceleration;
  var kElasticAcceleration = this.kElasticAcceleration;
  var kMinimumDecelerationVelocity = this.kMinimumDecelerationVelocity;
  var kDecelerationFactor = this.kDecelerationFactor;
  var kMinimumVelocity = this.kMinimumVelocity;
  var kMinimumPageTurnVelocity = this.kMinimumPageTurnVelocity;
  var kMouseWheelTimeout = this.kMouseWheelTimeout;
  
  // Declare variables to store the state.
  var startAccelerateX = 0;
  var startAccelerateY = 0;
  var lastTimeStamp = Date['now'] ? Date.now() : +(new Date);
  var lastMouseX = -1;
  var lastMouseY = -1;
  var lastTouchIdentifier = 0;
  var isScrolling = false;
  var isDecelerating = false;
  var decelerationAnimationInterval = null;
  var mouseWheelTimeout = null;
  
  // Attach event handlers.
  var self = this;
  var isTouchSupported = !!('ontouchstart' in window);
  
  $element.bind('mousewheel DOMMouseScroll', function(evt) {
    evt.preventDefault();
    
    window.clearTimeout(mouseWheelTimeout);
    
    var originalEvent = evt.originalEvent;
    var detail = originalEvent.detail;
    var delta = originalEvent.wheelDelta;
    var normalizedDelta = (detail) ? ((delta) ? ((delta / detail / 40 * detail > 0) ? 1 : -1) : -detail / 3) : delta / 120;
    
    var scrollContent = self.getScrollContent();
    var scrollViewSize = self.getSize();
    var contentSize = scrollContent.getSize();
    
    var minimumX = scrollViewSize.width - contentSize.width;
    var minimumY = scrollViewSize.height - contentSize.height;
    self.setMinimumX(minimumX);
    self.setMinimumY(minimumY);
    
    var deltaX = 0;
    var deltaY = normalizedDelta * 8;
    
    var shouldScrollHorizontal = self.shouldScrollHorizontal();
    var shouldScrollVertical = self.shouldScrollVertical();
    
    var scrollOffset = self.getScrollOffset();
    var x = scrollOffset.x + deltaX;
    var y = scrollOffset.y + deltaY;
    
    var distancePastBoundsX = (x < minimumX) ? minimumX - x : ((x > 0) ? x : 0);
    var distancePastBoundsY = (y < minimumY) ? minimumY - y : ((y > 0) ? y : 0);
    
    if (distancePastBoundsX > 0) x -= distancePastBoundsX / deltaX;
    if (distancePastBoundsY > 0) y -= distancePastBoundsY / deltaY;
    
    if (self.getPullToRefresh() && y >= $pullToRefresh.height() - 1) {
      y = $pullToRefresh.height() - 1;
      $pullToRefresh.addClass('sk-active');
    }
    
    self.setScrollOffset({
      x: shouldScrollHorizontal ? x : 0,
      y: shouldScrollVertical ? y : 0
    });
    
    var shouldStartScroll = false;
    
    if (shouldScrollHorizontal && deltaX !== 0) {
      horizontalScrollBar.update();
      shouldStartScroll = !isScrolling;
    }
    
    if (shouldScrollVertical && deltaY !== 0) {
      verticalScrollBar.update();
      shouldStartScroll = !isScrolling;
    }
    
    if (shouldStartScroll) beforeScrollStart();
    
    mouseWheelTimeout = window.setTimeout(function() {      
      x = (x < minimumX) ? minimumX : (x > 0) ? 0 : x;
      y = (y < minimumY) ? minimumY : (y > 0) ? 0 : y;
      
      if (self.getPullToRefresh() && $pullToRefresh.hasClass('sk-active')) {
        $pullToRefresh.removeClass('sk-active');
        $element.trigger(ScrollKit.ScrollView.EventType.DidPullToRefresh);
      }
      
      self.setScrollOffset({
        x: shouldScrollHorizontal ? x : 0,
        y: shouldScrollVertical ? y : 0
      }, kBounceTransitionDuration);
      
      beforeScrollEnd();
    }, kMouseWheelTimeout);
  });
  
  var mouseDownHandler = function(evt) {
    var scrollContent = self.getScrollContent();
    
    var scrollViewSize = self.getSize();
    var scrollContentSize = scrollContent.getSize();
    
    self.setMinimumX(scrollViewSize.width - scrollContentSize.width);
    self.setMinimumY(scrollViewSize.height - scrollContentSize.height);
    
    var scrollOffset = self.getScrollOffset();
    
    startAccelerateX = scrollOffset.x;
    startAccelerateY = scrollOffset.y;
    lastTimeStamp = evt.timeStamp;
    
    if (evt.type === 'touchstart') {
      var touch = evt.originalEvent.targetTouches[0];
      lastMouseX = touch.pageX;
      lastMouseY = touch.pageY;
      lastTouchIdentifier = touch.identifier;
    } else {
      lastMouseX = evt.pageX;
      lastMouseY = evt.pageY;
    }
    
    stopDeceleration();
    
    if (self.shouldScrollHorizontal()) self.getHorizontalScrollBar().update(true);
    if (self.shouldScrollVertical()) self.getVerticalScrollBar().update(true);
    
    $window.bind(isTouchSupported ? 'touchmove' : 'mousemove', mouseMoveHandler);
    $window.bind(isTouchSupported ? 'touchend' : 'mouseup', mouseUpHandler);
  };
  
  $element.bind(isTouchSupported ? 'touchstart' : 'mousedown', mouseDownHandler);
  
  var mouseMoveHandler = function(evt) {
    evt.preventDefault();
    
    var shouldScrollHorizontal = self.shouldScrollHorizontal();
    var shouldScrollVertical = self.shouldScrollVertical();
    
    var mouseX, mouseY;
    if (evt.type === 'touchmove') {
      var touches = evt.originalEvent.touches;
      var touch = touches[0];
      
      for (var i = 0, length = touches.length; i < length; i++) {
        if (touches[i].identifier === lastTouchIdentifier) {
          touch = touches[i];
          break;
        }
      }
      
      mouseX = touch.pageX;
      mouseY = touch.pageY;
    } else {
      mouseX = evt.pageX;
      mouseY = evt.pageY;
    }
    
    var deltaX = mouseX - lastMouseX;
    var deltaY = mouseY - lastMouseY;
    
    var scrollOffset = self.getScrollOffset();
    var x = scrollOffset.x + deltaX;
    var y = scrollOffset.y + deltaY;
    
    x -= ((x < self.getMinimumX()) ? deltaX : (x > 0) ? deltaX : 0) / 2;
    y -= ((y < self.getMinimumY()) ? deltaY : (y > 0) ? deltaY : 0) / 2;
    
    if (self.getPullToRefresh()) {
      if (y >= $pullToRefresh.height() - 1) {
        y = $pullToRefresh.height() - 1;
        $pullToRefresh.addClass('sk-active');
      } else {
        $pullToRefresh.removeClass('sk-active');
      }
    }
    
    self.setScrollOffset({
      x: shouldScrollHorizontal ? x : 0,
      y: shouldScrollVertical ? y : 0
    });
    
    var accelerationTime = evt.timeStamp - lastTimeStamp;
    
    if (accelerationTime > kAccelerationTimeout) {
      startAccelerateX = x;
      startAccelerateY = y;
      lastTimeStamp = evt.timeStamp;
    }
    
    var shouldStartScroll = false;
    
    if (shouldScrollHorizontal && deltaX !== 0) {
      horizontalScrollBar.update();
      shouldStartScroll = !isScrolling;
    }
    
    if (shouldScrollVertical && deltaY !== 0) {
      verticalScrollBar.update();
      shouldStartScroll = !isScrolling;
    }
    
    if (shouldStartScroll) beforeScrollStart();
    
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  };
  
  var mouseUpHandler = function(evt) {
    var timeStamp = evt.timeStamp;
    var accelerationTime = timeStamp - lastTimeStamp;
    
    var shouldScrollHorizontal = self.shouldScrollHorizontal();
    var shouldScrollVertical = self.shouldScrollVertical();
    
    var scrollOffset = self.getScrollOffset();
    var x = Math.min(Math.max(self.getMinimumX(), scrollOffset.x), 0);
    var y = Math.min(Math.max(self.getMinimumY(), scrollOffset.y), 0);
    
    var bounce = function() {
      $element.bind('webkitTransitionEnd transitionend MSTransitionEnd oTransitionEnd transitionEnd', function(evt) {
        $element.unbind(evt);
        beforeScrollEnd();
      });
      
      self.setScrollOffset({ x: x, y: y }, kBounceTransitionDuration);
      
      if (shouldScrollHorizontal) horizontalScrollBar.setHidden(true);
      if (shouldScrollVertical) verticalScrollBar.setHidden(true);
      
      if (self.getPullToRefresh() && $pullToRefresh.hasClass('sk-active')) {
        $pullToRefresh.removeClass('sk-active');
        $element.trigger(ScrollKit.ScrollView.EventType.DidPullToRefresh);
      }
    };
    
    if (self.getPagingEnabled()) {
      var acceleration = (timeStamp - lastTimeStamp) / kAcceleration;
      var accelerateDeltaX = scrollOffset.x - startAccelerateX;
      var velocityX = accelerateDeltaX / acceleration;      
      var pageWidth = $window.width();
      var pageCount = Math.floor(self.getScrollContent().getSize().width / pageWidth);
      var currentPageIndex = Math.abs(Math.round(x / pageWidth));
      var previousPageIndex = self.getCurrentPageIndex();
      
      if (previousPageIndex === currentPageIndex && Math.abs(velocityX) > kMinimumPageTurnVelocity) currentPageIndex += (velocityX > 0) ? -1 : 1;
      
      currentPageIndex = Math.min(Math.max(currentPageIndex, 0), pageCount - 1);
      self.setCurrentPageIndex(currentPageIndex);
      
      $element.bind('webkitTransitionEnd transitionend MSTransitionEnd oTransitionEnd transitionEnd', function(evt) {
        $element.unbind(evt);
        beforeScrollEnd();
      });
    }
    
    else {
      if (accelerationTime < kAccelerationTimeout) {
        if (x !== scrollOffset.x || y !== scrollOffset.y) bounce();
        
        else startDeceleration(timeStamp);
      }
      
      else if (x !== scrollOffset.x || y !== scrollOffset.y) bounce();
      
      else beforeScrollEnd();
    }
    
    _isDragging = false;
    _lastMouseX = -1;
    _lastMouseY = -1;
    _lastTimeStamp = timeStamp;
    
    $window.unbind(isTouchSupported ? 'touchmove' : 'mousemove', mouseMoveHandler);
    $window.unbind(evt);
  };
  
  var beforeScrollStart = function() {
    if (isScrolling) return;
    isScrolling = true;
    
    if (self.shouldScrollHorizontal()) horizontalScrollBar.setHidden(false);
    if (self.shouldScrollVertical()) verticalScrollBar.setHidden(false);
    
    $('input:focus').blur();
    
    $element.trigger(ScrollKit.ScrollView.EventType.ScrollStart);
  };
  
  var beforeScrollEnd = function() {
    if (!isScrolling) return;
    isScrolling = false;
    
    var scrollOffset = self.getScrollOffset();    
    self.setScrollOffset({
      x: Math.round(scrollOffset.x),
      y: Math.round(scrollOffset.y)
    });
    
    if (self.shouldScrollHorizontal()) horizontalScrollBar.setHidden(true);
    if (self.shouldScrollVertical()) verticalScrollBar.setHidden(true);
    
    $element.trigger(ScrollKit.ScrollView.EventType.ScrollEnd);
  };
  
  var startDeceleration = function(startTime) {
    var acceleration = (startTime - lastTimeStamp) / kAcceleration;
    var scrollOffset = self.getScrollOffset();
    var accelerateDeltaX = scrollOffset.x - startAccelerateX;
    var accelerateDeltaY = scrollOffset.y - startAccelerateY;
    var velocityX = accelerateDeltaX / acceleration;
    var velocityY = accelerateDeltaY / acceleration;
    var minimumX = self.getMinimumX();
    var minimumY = self.getMinimumY();
    var shouldScrollHorizontal = self.shouldScrollHorizontal();
    var shouldScrollVertical = self.shouldScrollVertical();
    var elasticDeceleration = kElasticDeceleration;
    var elasticAcceleration = kElasticAcceleration;
    var lastFrameTime = 0;
    
    var stepAnimation = function (currentFrameTime) {
      if (!isDecelerating) return;
      
      var deltaTime = currentFrameTime - lastFrameTime;
      var x = scrollOffset.x + (shouldScrollHorizontal ? velocityX : 0);
      var y = scrollOffset.y + (shouldScrollVertical ? velocityY : 0);
      
      velocityX *= kDecelerationFactor;
      velocityY *= kDecelerationFactor;
      
      if (Math.abs(velocityX) <= kMinimumVelocity && Math.abs(velocityY) <= kMinimumVelocity) {
        isDecelerating = false;
        beforeScrollEnd();
        return;
      }
      
      self.setScrollOffset({ x: x, y: y });
      
      decelerationAnimationInterval = window.requestAnimationFrame(stepAnimation);
      
      var elasticX = (x < minimumX) ? minimumX - x : (x > 0) ? -x : 0;
      var elasticY = (y < minimumY) ? minimumY - y : (y > 0) ? -y : 0;
      
      if (elasticX) velocityX = (elasticX * velocityX <= 0) ? velocityX + (elasticX * elasticDeceleration) : elasticX * elasticAcceleration;
      if (elasticY) velocityY = (elasticY * velocityY <= 0) ? velocityY + (elasticY * elasticDeceleration) : elasticY * elasticAcceleration;
      
      lastFrameTime = currentFrameTime;
    };
    
    if (Math.abs(velocityX) > kMinimumDecelerationVelocity || Math.abs(velocityY) > kMinimumDecelerationVelocity) {
      isDecelerating = true;
      decelerationAnimationInterval = window.requestAnimationFrame(stepAnimation);
      lastFrameTime = Date['now'] ? Date.now() : +(new Date);
    } else {
      beforeScrollEnd();
    }
  };
  
  var stopDeceleration = function() {
    isDecelerating = false;
    window.cancelAnimationFrame(decelerationAnimationInterval);
  };
};

/**
  Event types for ScrollKit.ScrollView.
*/
ScrollKit.ScrollView.EventType = {
  ScrollStart: 'ScrollKit:ScrollView:ScrollStart',
  ScrollEnd: 'ScrollKit:ScrollView:ScrollEnd',
  ScrollChange: 'ScrollKit:ScrollView:ScrollChange',
  WillScrollToTop: 'ScrollKit:ScrollView:WillScrollToTop',
  DidScrollToTop: 'ScrollKit:ScrollView:DidScrollToTop',
  PageChanged: 'ScrollKit:ScrollView:PageChanged',
  DidPullToRefresh: 'ScrollKit:ScrollView:DidPullToRefresh'
};

ScrollKit.ScrollView.prototype = {
  constructor: ScrollKit.ScrollView,
  
  element: null,
  $element: null,
  
  $pullToRefresh: null,
  
  kBounceTransitionDuration: 0.35,
  kAccelerationTimeout: 250,
  kAcceleration: 15,
  kElasticDeceleration: 0.03,
  kElasticAcceleration: 0.08,
  kMinimumDecelerationVelocity: 1,
  kDecelerationFactor: 0.95,
  kMinimumVelocity: 0.01,
  kMinimumPageTurnVelocity: 5,
  kMouseWheelTimeout: 80,
  
  _scrollContent: null,
  
  /**
    Returns the inner scroll content for this scroll view.
    @type ScrollKit.ScrollContent
  */
  getScrollContent: function() { return this._scrollContent; },
  
  /**
    Sets the inner scroll content for this scroll view.
    @param {ScrollKit.ScrollContent} scrollContent The inner scroll content for this scroll view.
  */
  setScrollContent: function(scrollContent) { this._scrollContent = scrollContent; },
  
  /**
    Returns the size of this scroll view.
    @description NOTE: This is the size of the scroll view container, NOT the scroll content area.
    The object returned contains two properties: |width| and |height|.
    @type Object
  */
  getSize: function() {
    var $element = this.$element;
    return { width: $element.width(), height: $element.height() };
  },
  
  _scrollOffset: null,
  
  /**
    Returns the current scroll offset position for this scroll view.
    @description NOTE: The object returned contains two properties: |x| and |y|.
    @type Object
  */
  getScrollOffset: function() { return this._scrollOffset; },
  
  /**
    Sets the scroll offset position for this scroll view and optionally animates the
    transition to the new position.
    @description NOTE: The scroll offset object provided should specify one or both of the
    |x| and |y| properties. If either are omitted, the previous values will be used.
    @param {Object} scrollOffset The scroll offset position for this scroll view.
    @param {Number} [animationDuration] The optional duration specified in seconds to use
    when animating to the new position. If not specified, the transition to the new position
    will not be animated.
  */
  setScrollOffset: function(scrollOffset, animationDuration) {
    var _scrollOffset = this._scrollOffset;    
    var x = _scrollOffset.x = (scrollOffset.x !== 0) ? (scrollOffset.x || _scrollOffset.x) : 0;
    var y = _scrollOffset.y = (scrollOffset.y !== 0) ? (scrollOffset.y || _scrollOffset.y) : 0;
    
    this.getScrollContent().translate(x, y, animationDuration);
  },
  
  _minimumX: 0,
  
  /**
    Returns the minimum X offset for this scroll view.
    @type Number
  */
  getMinimumX: function() { return this._minimumX; },
  
  /**
    Sets the minimum X offset for this scroll view.
    @param {Number} minimumX The new minimum X offset to be used for this scroll view.
  */
  setMinimumX: function(minimumX) { this._minimumX = minimumX; },
  
  _minimumY: 0,
  
  /**
    Returns the minimum Y offset for this scroll view.
    @type Number
  */
  getMinimumY: function() { return this._minimumY; },
  
  /**
    Sets the minimum Y offset for this scroll view.
    @param {Number} minimumX The new minimum X offset to be used for this scroll view.
  */
  setMinimumY: function(minimumY) { this._minimumY = minimumY; },
  
  _horizontalScrollBar: null,
  
  /**
    Returns the horizontal scroll bar for this scroll view.
    @type ScrollKit.ScrollBar
  */
  getHorizontalScrollBar: function() { return this._horizontalScrollBar; },
  
  /**
    Sets the horizontal scroll bar for this scroll view.
    @param {ScrollKit.ScrollBar} horizontalScrollBar The horizontal scroll bar for this scroll view.
  */
  setHorizontalScrollBar: function(horizontalScrollBar) { this._horizontalScrollBar = horizontalScrollBar; },
  
  _verticalScrollBar: null,
  
  /**
    Returns the vertical scroll bar for this scroll view.
    @type ScrollKit.ScrollBar
  */
  getVerticalScrollBar: function() { return this._verticalScrollBar; },
  
  /**
    Sets the vertical scroll bar for this scroll view.
    @param {ScrollKit.ScrollBar} verticalScrollBar The vertical scroll bar for this scroll view.
  */
  setVerticalScrollBar: function(verticalScrollBar) { this._verticalScrollBar = verticalScrollBar; },
  
  _alwaysBounceHorizontal: false,
  
  /**
    Returns a flag indicating if this scroll view should always bounce horizontally.
    @description NOTE: The default behavior is for the bounce to only occur if the size of the inner
    scroll content area exceeds the size of this scroll view horizontally.
    @type Boolean
  */
  getAlwaysBounceHorizontal: function() { return this._alwaysBounceHorizontal; },
  
  /**
    Sets a flag indicating if this scroll view should always bounce horizontally.
    @description NOTE: The default behavior is for the bounce to only occur if the size of the inner
    scroll content area exceeds the size of this scroll view horizontally.
    @param {Boolean} alwaysBounceHorizontal The flag indicating if this scroll view should always bounce horizontally.
  */
  setAlwaysBounceHorizontal: function(alwaysBounceHorizontal) { this._alwaysBounceHorizontal = alwaysBounceHorizontal; },
  
  _alwaysBounceVertical: false,
  
  /**
    Returns a flag indicating if this scroll view should always bounce vertically.
    @description NOTE: The default behavior is for the bounce to only occur if the size of the inner
    scroll content area exceeds the size of this scroll view vertically.
    @type Boolean
  */
  getAlwaysBounceVertical: function() { return this._alwaysBounceVertical; },
  
  /**
    Sets a flag indicating if this scroll view should always bounce vertically.
    @description NOTE: The default behavior is for the bounce to only occur if the size of the inner
    scroll content area exceeds the size of this scroll view vertically.
    @param {Boolean} alwaysBounceVertical The flag indicating if this scroll view should always bounce vertically.
  */
  setAlwaysBounceVertical: function(alwaysBounceVertical) { this._alwaysBounceVertical = alwaysBounceVertical; },
  
  _pagingEnabled: false,
  
  /**
    Returns a flag indicating if this scroll view should snap at each "page" of content.
    @description NOTE: The width of a "page" is determined by the width of this scroll view.
    @type Boolean
  */
  getPagingEnabled: function() { return this._pagingEnabled; },
  
  /**
    Sets a flag indicating if this scroll view should snap at each "page" of content.
    @description NOTE: The width of a "page" is determined by the width of this scroll view.
    @param {Boolean} pagingEnabled The flag indicating if this scroll view should snap at each "page" of content.
  */
  setPagingEnabled: function(pagingEnabled) { this._pagingEnabled = pagingEnabled; },
  
  _pullToRefresh: false,
  
  /**
    Returns a flag indicating if this scroll view contains a "pull to refresh" area at the
    top of the scroll content.
    @type Boolean
  */
  getPullToRefresh: function() { return this._pullToRefresh; },
  
  /**
    Sets a flag indicating if this scroll view contains a "pull to refresh" area at the
    top of the scroll content.
    @param {Boolean} pagingEnabled The flag indicating if this scroll view contains a "pull to refresh" area.
  */
  setPullToRefresh: function(pullToRefresh) {
    this._pullToRefresh = pullToRefresh;
    
    if (pullToRefresh) {
      this.$pullToRefresh.removeClass('sk-hidden');
    } else {
      this.$pullToRefresh.addClass('sk-hidden');
    }
  },
  
  _currentPageIndex: 0,
  
  /**
    Returns the index of the current "page" of content being displayed.
    @description NOTE: This value is only used when paging is enabled for this scroll view.
    @type Number
  */
  getCurrentPageIndex: function() { return this._currentPageIndex; },
  
  /**
    Sets the index of the current "page" of content being displayed and animates to the
    offset of the page's bounds if necessary.
    @description NOTE: This value is only used when paging is enabled for this scroll view.
    @param {Number} currentPageIndex The index of the "page" of content to be displayed.
  */
  setCurrentPageIndex: function(currentPageIndex) {
    var previousPageIndex = this.getCurrentPageIndex();
    this._currentPageIndex = currentPageIndex;
    
    this.setScrollOffset({
      x: -currentPageIndex * $(window['addEventListener'] ? window : document.body).width()
    }, this.kBounceTransitionDuration);
    
    if (currentPageIndex !== previousPageIndex) this.$element.trigger(ScrollKit.ScrollView.EventType.PageChanged);
  },
  
  /**
    Returns a flag to determine if this scroll view should scroll horizontally.
    @description NOTE: This flag should be |true| if the width of the inner scroll content area
    is larger than the width of this scroll view or if the |alwaysBounceHorizontal| flag is set.
    @type Boolean
  */
  shouldScrollHorizontal: function() { return this.getAlwaysBounceHorizontal() || (this.getMinimumX() < 0); },
  
  /**
    Returns a flag to determine if this scroll view should scroll vertically.
    @description NOTE: This flag should be |true| if the height of the inner scroll content area
    is larger than the height of this scroll view or if the |alwaysBounceVertical| flag is set.
    @type Boolean
  */
  shouldScrollVertical: function() { return this.getAlwaysBounceVertical() || (this.getMinimumY() < 0); },
  
  /**
    Animates scrolling back to the top of this scroll view.
  */
  scrollToTop: function() {
    var scrollContent = this.getScrollContent();
    var margin = scrollContent.getMargin();
    
    this.$element.trigger(ScrollKit.ScrollView.EventType.WillScrollToTop);
    
    scrollContent.setMargin({
      top: 0,
      bottom: margin.top + margin.bottom
    });
    
    this.setScrollOffset({ x: 0, y: 0 }, this.kBounceTransitionDuration);
    this.$element.trigger(ScrollKit.ScrollView.EventType.DidScrollToTop);
  }
};

/**
  Creates a new content area for a ScrollView.
  @param {HTMLDivElement} element The DIV element to initialize as a new ScrollView content area.
  @param {ScrollKit.ScrollView} [scrollView] The optional scroll view to bind this content area to.
  @constructor
*/
ScrollKit.ScrollContent = function ScrollContent(element, scrollView) {
  if (!element) return;
  
  var $element = this.$element = $(element);
  var element = this.element = $element[0];
  
  var scrollContent = element.scrollContent;
  if (scrollContent) return scrollContent;
  
  element.scrollContent = this;
  
  $element.addClass('sk-scroll-content');
  
  this._margin = { top: 0, right: 0, bottom: 0, left: 0 };
  
  if (scrollView) this.setScrollView(scrollView);
};

ScrollKit.ScrollContent.prototype = {
  constructor: ScrollKit.ScrollContent,
  
  element: null,
  $element: null,
  
  _scrollView: null,
  
  /**
    Returns the parent scroll view for this scroll content.
    @type ScrollKit.ScrollView
  */
  getScrollView: function() { return this._scrollView; },
  
  /**
    Sets the parent scroll view for this scroll content.
    @param {ScrollKit.ScrollView} scrollView The parent scroll view for this scroll content.
  */
  setScrollView: function(scrollView) { this._scrollView = scrollView; },
  
  _margin: null,
  
  /**
    Returns the margin to be applied to the exterior of this scroll content.
    @description NOTE: The object returned contains four properties: |top|, |right|,
    |bottom| and |left|.
    @type Object
  */
  getMargin: function() { return this._margin; },
  
  /**
    Sets the margin to be applied to the exterior of this scroll content.
    @description NOTE: The margin object provided should specify one or more of the
    |top|, |right|, |bottom| and |left| properties. If any are omitted, their previous values
    will be used.
    @param {Object} margin The margin to be applied to the exterior of this scroll content.
  */
  setMargin: function(margin) {
    var _margin = this._margin;
    _margin.top = (margin.top !== 0) ? (margin.top || _margin.top) : 0;
    _margin.right = (margin.right !== 0) ? (margin.right || _margin.right) : 0;
    _margin.bottom = (margin.bottom !== 0) ? (margin.bottom || _margin.bottom) : 0;
    _margin.left = (margin.left !== 0) ? (margin.left || _margin.left) : 0;
  },
  
  /**
    Sets the top margin to be applied to the exterior of this scroll content.
    @param {Number} marginTop The top margin to be applied to the exterior of this scroll content.
  */
  setMarginTop: function(marginTop) { this._margin.top = marginTop || 0; },
  
  /**
    Sets the right margin to be applied to the exterior of this scroll content.
    @param {Number} marginRight The right margin to be applied to the exterior of this scroll content.
  */
  setMarginRight: function(marginRight) { this._margin.right = marginRight || 0; },
  
  /**
    Sets the bottom margin to be applied to the exterior of this scroll content.
    @param {Number} marginBottom The bottom margin to be applied to the exterior of this scroll content.
  */
  setMarginBottom: function(marginBottom) { this._margin.bottom = marginBottom || 0; },
  
  /**
    Sets the left margin to be applied to the exterior of this scroll content.
    @param {Number} marginLeft The left margin to be applied to the exterior of this scroll content.
  */
  setMarginLeft: function(marginLeft) { this._margin.left = marginLeft || 0; },
  
  /**
    Returns the size of this scroll content area.
    @description NOTE: This is the size of the inner scroll content area, NOT the scroll view container.
    The object returned contains two properties: |width| and |height|.
    @type Object
  */
  getSize: function() {
    var $element = this.$element;
    var margin = this.getMargin();
    return { width: $element.width() + margin.left + margin.right, height: $element.height() + margin.top + margin.bottom };
  },
  
  /**
    Translates this scroll content area to the specified X and Y position and optionally
    animates the transition to the new position.
    @param {Number} x The X position to translate this scroll content area to.
    @param {Number} y The Y position to translate this scroll content area to.
    @param {Number} [duration] The optional duration specified in seconds to use
    when animating to the new position. If not specified, the transition to the new position
    will not be animated.
  */
  translate: function(x, y, duration) {
    var $element = this.$element;
    var margin = this.getMargin();
    
    var x = x + margin.left;
    var y = y + margin.top;
    var duration = (duration) ? duration + 's' : '0s';
    var translate3d = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    var translate = 'translate(' + x + 'px, ' + y + 'px)';
    
    $element.css({
      '-webkit-transition-duration': duration,
      '-moz-transition-duration': duration,
      '-ms-transition-duration': duration,
      '-o-transition-duration': duration,
      'transition-duration': duration,
      '-webkit-transform': translate3d,
      '-moz-transform': translate,
      '-ms-transform': translate,
      '-o-transform': translate,
      'transform': translate
    });
    
    var scrollView = this.getScrollView();
    if (scrollView.shouldScrollHorizontal()) scrollView.getHorizontalScrollBar().update();
    if (scrollView.shouldScrollVertical()) scrollView.getVerticalScrollBar().update();
    
    scrollView.$element.trigger(ScrollKit.ScrollView.EventType.ScrollChange);
  }
};

/**
  Creates a new scroll bar for a ScrollView.
  @param {ScrollKit.ScrollView} scrollView The scroll view to bind this scroll bar to.
  @param {Number} scrollBarType The type of scroll bar orientation to create defined by
  the ScrollKit.ScrollBar.ScrollBarType singleton (e.g.: horizontal or vertical).
  @constructor
*/
ScrollKit.ScrollBar = function ScrollBar(scrollView, scrollBarType) {
  var $element = this.$element = $('<div class="sk-scroll-bar"/>');
  var element = this.element = $element[0];
  
  this.setScrollView(scrollView);
  this.setScrollBarType(scrollBarType);
};

/**
  Scroll bar orientation types for ScrollKit.ScrollBar.
*/
ScrollKit.ScrollBar.ScrollBarType = {
  Horizontal: 0,
  Vertical: 1
};

ScrollKit.ScrollBar.prototype = {
  constructor: ScrollKit.ScrollBar,
  
  element: null,
  $element: null,
  
  _scrollView: null,
  
  /**
    Returns the parent scroll view for this scroll content.
    @type ScrollKit.ScrollView
  */
  getScrollView: function() { return this._scrollView; },
  
  /**
    Sets the parent scroll view for this scroll content.
    @param {ScrollKit.ScrollView} scrollView The parent scroll view for this scroll content.
  */
  setScrollView: function(scrollView) {
    this._scrollView = scrollView;
    scrollView.$element.append(this.$element);
  },
  
  _scrollBarType: -1,
  
  /**
    Returns the orientation type for this scroll bar.
    @description NOTE: The available scroll bar orientation types are defined by the
    ScrollKit.ScrollBar.ScrollBarType singleton.
    @type Number
  */
  getScrollBarType: function() { return this._scrollBarType; },
  
  /**
    Sets the orientation type for this scroll bar.
    @description NOTE: The available scroll bar orientation types are defined by the
    ScrollKit.ScrollBar.ScrollBarType singleton.
    @param {Number} scrollBarType The the orientation type for this scroll bar.
  */
  setScrollBarType: function(scrollBarType) {
    this._scrollBarType = scrollBarType;
    
    if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Horizontal) {
      this.$element.css({ 'bottom': '0', 'left': '0' });
    }
    
    else if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Vertical) {
      this.$element.css({ 'top': '0', 'right': '0' });
    }
    
    this.setThickness(this.getThickness());
    this.setSize(this.getSize());
  },
  
  _thickness: 5,
  
  /**
    Returns the thickness (in pixels) to use when rendering this scroll bar.
    @type Number
  */
  getThickness: function() { return this._thickness; },
  
  /**
    Sets the thickness (in pixels) to use when rendering this scroll bar.
    @param {Number} thickness The thickness (in pixels) to use when rendering this
    scroll bar.
  */
  setThickness: function(thickness) {
    var scrollBarType = this.getScrollBarType();
    this._thickness = thickness;
    
    if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Horizontal) {
      this.$element.css({ 'height': thickness + 'px' });
    }
    
    else if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Vertical) {
      this.$element.css({ 'width': thickness + 'px' });
    }
  },
  
  _size: 12,
  
  /**
    Returns the current size/length (in pixels) used when rendering this scroll bar.
    @type Number
  */
  getSize: function() { return this._size; },
  
  /**
    Sets the current size/length (in pixels) used when rendering this scroll bar.
    @param {Number} size The current size/length (in pixels) used when rendering this
    scroll bar.
  */
  setSize: function(size) {
    if (this._size === size) return;
    
    var scrollBarType = this.getScrollBarType();
    this._size = size;

    if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Horizontal) {
      this.$element.css({ 'width': Math.round(size) + 'px' });
    }
    
    else if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Vertical) {
      this.$element.css({ 'height': Math.round(size) + 'px' });
    }
  },
  
  _minimumSize: 12,
  
  /**
    Returns the minimum possible size/length (in pixels) to use when rendering this scroll bar.
    @type Number
  */
  getMinimumSize: function() { return this._minimumSize; },
  
  /**
    Sets the minimum possible size/length (in pixels) to use when rendering this scroll bar.
    @param {Number} minimumSize The minimum possible size/length (in pixels) to use when rendering
    this scroll bar.
  */
  setMinimumSize: function(minimumSize) { this._minimumSize = minimumSize; },
  
  _hidden: true,
  
  /**
    Returns a flag indicating if this scroll bar is hidden.
    @type Boolean
  */
  getHidden: function() { return this._hidden; },
  
  /**
    Sets a flag indicating if this scroll bar should be hidden.
    @param {Boolean} hidden The flag indicating if this scroll bar should be hidden.
  */
  setHidden: function(hidden) {
    if (this._hidden = hidden) {
      this.$element.removeClass('active');
    } else {
      this.$element.addClass('active');
    }
  },
  
  /**
    Updates the position and size of this scroll bar based on its parent scroll view's
    current scroll offset.
  */
  update: function() {
    var scrollView = this.getScrollView();
    var scrollContent = scrollView.getScrollContent();
    var scrollOffset = scrollView.getScrollOffset();
    
    var scrollViewSize = scrollView.getSize();
    var scrollContentSize = scrollContent.getSize();
    
    var scrollBarType = this.getScrollBarType();
    var minimumSize = this.getMinimumSize();
    var thickness = this.getThickness();
    
    var margin, size, scrollPosition, minimumPosition, position, translate3d, translate;
    
    if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Horizontal) {
      margin = (scrollView.shouldScrollVertical() ? thickness * 2 : thickness) + 1;
      scrollPosition = scrollOffset.x;
      size = Math.max(minimumSize, (scrollViewSize.width / scrollContentSize.width) * (scrollViewSize.width - margin));
      minimumPosition = scrollView.getMinimumX();
      position = (scrollPosition / minimumPosition) * (scrollViewSize.width - margin - size);
      
      if (scrollPosition > 0) {
        size = Math.max(size - scrollPosition, thickness);
        position = 1;
      } else if (scrollPosition < minimumPosition) {
        size = Math.max(size - minimumPosition + scrollPosition, thickness);
        position = scrollViewSize.width - size - margin;
      }
      
      translate3d = 'translate3d(' + position + 'px, 0, 0)';
      translate = 'translate(' + position + 'px, 0)';
    }
    
    else if (scrollBarType === ScrollKit.ScrollBar.ScrollBarType.Vertical) {
      margin = (scrollView.shouldScrollHorizontal() ? thickness * 2 : thickness) + 1;
      scrollPosition = scrollOffset.y;
      size = Math.max(minimumSize, (scrollViewSize.height / scrollContentSize.height) * (scrollViewSize.height - margin));
      minimumPosition = scrollView.getMinimumY();
      position = (scrollPosition / minimumPosition) * (scrollViewSize.height - margin - size);
      
      if (scrollPosition > 0) {
        size = Math.max(size - scrollPosition, thickness);
        position = 1;
      } else if (scrollPosition < minimumPosition) {
        size = Math.max(size - minimumPosition + scrollPosition, thickness);
        position = scrollViewSize.height - size - margin;
      }
      
      translate3d = 'translate3d(0, ' + position + 'px, 0)';
      translate = 'translate(0, ' + position + 'px)';
    }
    
    this.setSize(size);
    
    this.$element.css({
      '-webkit-transform': translate3d,
      '-moz-transform': translate,
      '-ms-transform': translate,
      '-o-transform': translate,
      'transform': translate
    });
  }
};

$(function() {
  var $window = $(window['addEventListener'] ? window : document.body);
  
  // Add a <style/> tag to the head for adjusting page sizes after a resize.
  var $style = $('<style/>').appendTo($('head'));
  var resizeHandler = function(evt) {
    $style.html('.sk-page-container-horizontal > li { width: ' + $window.width() + 'px !important; }');
  };
  
  // Adjust page sizes after a resize.
  $window.bind('resize', resizeHandler);
  resizeHandler();
  
  // Initialize all ScrollViews.
  $('.sk-scroll-view').each(function(index, element) { new ScrollKit.ScrollView(element); });
});
