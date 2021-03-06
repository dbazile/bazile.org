(function (bazile, atoa) {

  'use strict'

  var ROUTES = [
    {
      className: '__about__',
      pattern: new RegExp('^/?about.html$'),
      placeholderUrl: '/.about.html',
    },
    {
      className: '__blog__',
      pattern: new RegExp('^/?((writing/(\\d{4}/)?[^/]+\.html)|index.html|)$'),
      placeholderUrl: '/.blog.html',
    },
    {
      className: '__portfolio__',
      pattern: new RegExp('^/?portfolio/(index.html|)$'),
      placeholderUrl: '/.portfolio.html',
    }
  ]

  var OWN_HOST = location.href.substring(0, location.href.indexOf(location.pathname))

  var PLACEHOLDER_DURATION = location.hostname.match(/^(localhost|127\.0\.0\.1)$/) ? 0 : 2000
  var NS_XLINK = 'http://www.w3.org/1999/xlink'
  var SHOW_PLACEHOLDER = '__showPlaceholder__'

  var _currentPathname
  var _queueBeforeNext = []
  var _encounters = {}

  //
  // Bootstrapping
  //

  _currentPathname = location.pathname
  scheduleInitialRevelation()
  recordEncounter(location.href)
  exposeQueueEventHooks()
  document.addEventListener('DOMContentLoaded', function () {
    fetchPlaceholders()
    subscribeToEvents()
  })

  //
  // Internals
  //

  function didEncounter(url) {
    var key = url.split('/')[3]
    return _encounters[key]
  }

  function disableHyperlinkInterception(context) {
    console.debug('(transitioner:disableHyperlinkInterception) removing from context', context)
    atoa(context.querySelectorAll('a'))
      .forEach(function (a) {
        a.removeEventListener('click', onLinkClicked)
      })
  }

  function enableHyperlinkInterception(context) {
    console.debug('(transitioner:enableHyperlinkInterception) attaching to context', context)
    atoa(context.querySelectorAll('a'))
      .filter(function (a) {
        var href = a.getAttribute('href') || a.getAttributeNS(NS_XLINK, 'href') || ''
        return !!getRoute(href)
      })
      .forEach(function (a) {
        a.addEventListener('click', onLinkClicked)
      })
  }

  function exposeQueueEventHooks() {
    bazile.transitioner = Object.freeze({
      beforeNext: function (fn) {
        _queueBeforeNext.push(fn)
      }
    })
  }

  function fetchDom(href, callback) {
    var xhr = new XMLHttpRequest()
    xhr.responseType = 'document'
    xhr.open('GET', href)
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 400) {
          onError()
          throw new Error('(transitioner:fetchDom) failed to fetch DOM')
        }
        callback(xhr.responseXML)
      }
    }
    xhr.send()
  }

  function fetchPlaceholders() {
    ROUTES.forEach(function (route) {
      if (document.documentElement.classList.contains(route.className)) {
        return
      }
      fetchDom(route.placeholderUrl, function (dom) {
        var placeholder = dom.body.firstChild
        document.importNode(placeholder, true)
        document.querySelector('.placeholders').appendChild(placeholder)
      })
    })
  }

  function flushBeforeNextQueue() {
    var func
    while ((func = _queueBeforeNext.pop())) {
      func()
    }
  }

  function getRoute(url) {
    return ROUTES.filter(function (route) {
      return route.pattern.test(url)
    }).pop()
  }

  function hidePlaceholder() {
    document.documentElement.classList.remove(SHOW_PLACEHOLDER)
  }

  function importScripts(context) {
    var container = document.querySelector('.scripts')
    console.debug('(transitioner:importScripts) from context', context)

    // Purge
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }

    // Fill
    atoa(context.querySelectorAll('script'))
      .forEach(function (script) {
        if (script.src.indexOf(OWN_HOST) !== 0) {
          console.warn('(transitioner:importScripts) discarding untrusted block:', script)
          return
        }
        script.parentNode.removeChild(script)
        var incomingScript = document.createElement('script')
        incomingScript.src = script.src

        container.appendChild(incomingScript)
      })
  }

  function onError() {
    disableHyperlinkInterception(document)
  }

  function onLinkClicked(event) {
    if (event.metaKey || event.ctrlKey) {
      return  // Don't click-jack attempts to open new tabs
    }

    var url = this.getAttribute('href') || this.getAttributeNS(NS_XLINK, 'href')
    transitionTo(url)
    history.pushState(null, null, url)

    // Record pathname
    _currentPathname = location.pathname

    // Reset scroll position
    window.scrollTo(0, 0)

    // Only if we're sure nothing broke thus far
    event.preventDefault()
  }

  function onPopState() {
    if (location.pathname === _currentPathname) {
      console.debug('(transitioner:onPopState) discarding hashchange')
      return  // Discard hashchange eventing from portfolio navigation
    }
    _currentPathname = location.pathname

    transitionTo(location.pathname + location.search)
  }

  function recordEncounter(url) {
    var key = url.split('/')[3]
    _encounters[key] = true
  }

  function scheduleInitialRevelation() {
    showPlaceholder()
    setTimeout(hidePlaceholder, PLACEHOLDER_DURATION)
  }

  function showPlaceholder() {
    document.documentElement.classList.add(SHOW_PLACEHOLDER)
  }

  function subscribeToEvents() {
    window.addEventListener('popstate', onPopState)
    enableHyperlinkInterception(document)
  }

  function transitionTo(url) {
    console.debug('(transitioner:transitionTo) look up route `%s`', url)
    var route = getRoute(url)
    if (!route) {
      console.warn('(transitioner:transitionTo) no route to `%s`', url)
      return
    }

    console.debug('(transitioner:transitionTo) ===> `%s`', url)

    flushBeforeNextQueue()

    document.documentElement.className = route.className
    showPlaceholder()

    var endTime = Date.now()
    if (!didEncounter(url)) {
      recordEncounter(url)
      endTime += PLACEHOLDER_DURATION
    }
    fetchDom(url, function (dom) {
      var nextMain = dom.querySelector('main')
      var previousMain = document.querySelector('main')

      console.groupCollapsed('(transitioner:transitionTo) rewiring hyperlinks and scripts')
      enableHyperlinkInterception(nextMain)
      disableHyperlinkInterception(previousMain)
      console.groupEnd()

      // Swap the titles
      document.title = dom.title

      // Swap the dynamic stuff
      importScripts(nextMain)

      // Swap out the content
      document.body.insertBefore(nextMain, previousMain)
      document.body.removeChild(previousMain)

      // Swap out the footers
      var nextFooter = dom.querySelector('footer')
      var previousFooter = document.querySelector('footer')
      document.body.insertBefore(nextFooter, previousFooter)
      document.body.removeChild(previousFooter)

      // Schedule revelation
      setTimeout(hidePlaceholder, endTime - Date.now())
    })
  }
}(window.bazile, window.atoa))
