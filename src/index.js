window["StatsigCodeHelper"] = window["StatsigCodeHelper"] || {
  _CODE_PARAM: 'code',
  _CONSOLE_DEBUG: localStorage.getItem('DEBUG_StatsigCodeHelper'),
  _pendingInjections: [],
  _addStatsigSdk: function(apiKey, nonce, callback) {
    const script = document.createElement('script');
    if (nonce) {
      script.nonce = nonce;
    }
    script.src = 'https://cdn.jsdelivr.net/npm/statsig-js';
    script.addEventListener('load', callback);
    document.head.appendChild(script);
  },

  injectDynamicCode: function(experimentId) {
    StatsigCodeHelper._pendingInjections.push(
      () => StatsigCodeHelper._runExperimentCode(experimentId)
    );
    if (StatsigCodeHelper._sdkInitialized) {
      StatsigCodeHelper._processPendingInjections();
    }
  },

  Utilities: {
    addStyles: stylesheetText => {
      const s = document.createElement('style');
      s.innerText = stylesheetText
      document.head.appendChild(s);
    },
    domReady: fn => {
      if (document.readyState !== 'loading') {
        fn();
      } else {
        document.addEventListener('DOMContentLoaded', fn);
      }
    },
    observer: (function() {
      let observer,
          changes = {};
    
      const applyChange = function(changeElt, cb) {     
        observer.disconnect();
        cb(changeElt);
        bindMutationObserver();  
      }
    
      function domReady(fn) {
        if (document.readyState !== 'loading') {
          fn();
        } else {
          document.addEventListener('DOMContentLoaded', fn);
        }
      }
    
      const bindMutationObserver = function(selector) {      
        // Create an observer instance to execute when mutations are observed
        observer = new MutationObserver(function (mutationsList) {
          const selectorList = Object.keys(changes);
          mutationsList.forEach(mutation => {
            selectorList.forEach(function(selector) {
              if(mutation.target && mutation.target.matches && mutation.target.matches(selector)) {              
                applyChange(mutation.target, changes[selector]);          
              }
              else if(mutation.target && mutation.target.nodeName !== '#text') {
                var mutationTargetChild = mutation.target.querySelectorAll(selector);
                mutationTargetChild.forEach(function(childEltMutated) {
                  applyChange(childEltMutated, changes[selector]);
                });
              }
            });
          });
        });  
    
        observer.observe(document.documentElement, {
          // attributes: true,
          // attributeOldValue: true,
          characterData: true,
          childList: true,
          subtree: true,        
          characterDataOldValue: false
        });
      }
    
      var watch = function(selector, cb) {
        changes[selector] = cb;
        if(!observer) bindMutationObserver();
        // apply changes if elements already exist
        domReady(function() {
          document.querySelectorAll(selector).forEach(function(existingElt) {
            applyChange(existingElt, cb);
          });
        });      
      }
    
      return watch;
    
    })()  
  },

  _processPendingInjections: function() {
    while (StatsigCodeHelper._pendingInjections.length) {
      const lambda = StatsigCodeHelper._pendingInjections.pop();
      if (lambda) {
        lambda();
      }
    }
  },

  _runExperimentCode: function(experimentId) {
    const config = statsig.getExperiment(experimentId);
    let code = config.get(StatsigCodeHelper._CODE_PARAM, null);
    if (code) {
      eval(code);
      return;
    }
    const codeConfig = config.get('codeConfig', null);
    const codeKey = config.get('codeKey', null);
    if (codeConfig && codeKey) {
      const codeDynamicConfig = statsig.getConfig(codeConfig);
      if (codeDynamicConfig) {
        code = codeDynamicConfig.get(codeKey, null);
        if (code) {
          eval(code);
          return;
        }
      }
    }
  },

  _evalString: function(jsString)  {
    let returnVal;
    try {
      returnVal = eval(jsString);
    } catch(err) {
      // Too noisy: StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Error running ${jsString}`, err);
    }      
    return returnVal;
  },

  _awaitTriggersDoCallback: function(triggers, callback) {
    const iterableTriggers = Object.entries(triggers),
          allTriggerPromises = [];

    if(!iterableTriggers.length) {
      StatsigCodeHelper._CONSOLE_DEBUG && console.log('No triggers, activating...');
      callback();
      return;
    }

    for(const [triggerType, triggerCondition] of iterableTriggers) {
      if(triggerType === 'element_exists') {     
        const settings = {
          selector: typeof triggerCondition === 'object' ? triggerCondition.selector: triggerCondition,
          continuous: typeof triggerCondition === 'object' ? triggerCondition.continuous: false
        };
        allTriggerPromises.push(new Promise((resolve, reject) => {
          StatsigCodeHelper.Utilities.observer(settings.selector, (elt) => {                         
            if(elt.dataset.statsigChangeApplied && settings.continuous) {
              // invoking callback when using {observe: true}
              callback();
            }            
            else if(!elt.dataset.statsigChangeApplied) {
              // the first detection of this select will get here
              elt.dataset.statsigChangeApplied = true;
              resolve();
            }
          });
        }));       
      }
      else if(triggerType === 'interval_condition') {
        allTriggerPromises.push(new Promise((resolve, reject) => {
          StatsigCodeHelper._intervalUntilTrueOrTimeout(() => {
            return !!StatsigCodeHelper._evalString(triggerCondition.js);
          }, parseInt(triggerCondition.js) || 5000).then(() => {
            StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Met interval_condition ${JSON.stringify(triggerCondition)}`);
            resolve();
          });
        }));
      }
      else if(triggerType === 'page_lifecycle' && triggerCondition === 'dom_ready') {
        allTriggerPromises.push(new Promise((resolve, reject) => {
          StatsigCodeHelper.Utilities.domReady(resolve);
        }));
      }
      else {
        // if there's an entry in the triggers array 
        StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Unknown condition: '${triggerType}' = '${triggerCondition}'`);
      }
    }
    // only attempt to activate if all triggers were added to pending promises array
    if(allTriggerPromises.length === iterableTriggers.length) {
      Promise.all(allTriggerPromises).then(callback);
    }
    else {
      StatsigCodeHelper._CONSOLE_DEBUG && console.log('Skipping activation logic because of unknown triggers');
    }
  },

  _intervalUntilTrueOrTimeout: function(checkFcn, timeout) {
    if(checkFcn()) return Promise.resolve();
    var stepMS = 50, runningForMS = 0;
    return new Promise((resolve, reject) => {
      var interval = setInterval(function() {
        if(checkFcn()) {         
          resolve();
          clearInterval(interval);
        }
        runningForMS += stepMS;
        if(runningForMS >= timeout) clearInterval(interval);
      }, stepMS);
    }); 
  },

  _attemptWebTests: async function(configKey) {
    const webConfig = statsig.getConfig(configKey);
    const webExperiments = webConfig.get('experiments', []);
    const utilFncString = webConfig.get('util', '');

    for(const experiment of webExperiments) {
      const {key, triggers = {}, url} = experiment;
      
      // check url before the triggers
      if(url && !window.location.pathname.match(new RegExp(url))) {
        console.log(`URL condition not met for ${key}: ${url}, skipping...`);      
        continue;
      }
      console.log(`URL condition met for ${key}: ${url}, evaluating triggers...`);                  
      StatsigCodeHelper._awaitTriggersDoCallback(triggers, () => {
        StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Activating test: ${key} with triggers`, triggers);
        StatsigCodeHelper._runExperimentCode(key);
      });
    }         
  },

  _initializeSDKAndAttemptWebTests: async function(apiKey, configKey) {
    if (!window['statsig']) {
      return;
    }
    if (!window.statsig.instance) {
      await statsig.initialize(apiKey, {});
      StatsigCodeHelper._sdkInitialized = true;
      StatsigCodeHelper._processPendingInjections();
      StatsigCodeHelper._attemptWebTests(configKey);
    }
  },
}

if (document.currentScript && document.currentScript.src) {
  const url = new URL(document.currentScript.src);
  const apiKey = url.searchParams.get('apikey'),
        configKey = url.searchParams.get('configkey');
  if (apiKey && configKey) {
    StatsigCodeHelper._addStatsigSdk(apiKey, document.currentScript.nonce, () => {
      StatsigCodeHelper._initializeSDKAndAttemptWebTests(apiKey, configKey);
    });
  }
}