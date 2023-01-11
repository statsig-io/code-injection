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

    /**
   * Dispatches window event 
   */
  _bindGlobalMutationObserver: function() {
    const observer = new MutationObserver(function (mutationsList) {
      const mutations = mutationsList.map(m => {
        return { type: m.type, target: m.target }
      });
      // console.log(mutations);
      const event = new Event('MutationEvent');
      window.dispatchEvent(event);
    });  
    observer.observe(document.documentElement, {
      attributes: true,        
      attributeOldValue: true,
      characterData: true,
      childList: true,
      subtree: true,        
      characterDataOldValue: true
    });    
  },

  _evalString: function(jsString)  {
    let returnVal;
    try {
      returnVal = eval(jsString);
    } catch(err) {
      StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Error running ${jsString}`, err);
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
        let elementExistsPromise;
        if(document.querySelector(triggerCondition)) {
          elementExistsPromise = Promise.resolve();
        }
        else {
          elementExistsPromise = new Promise((resolve, reject) => {
            const onDOMMutate = () => {
              if(document.querySelector(triggerCondition)) {
                window.removeEventListener('MutationEvent', onDOMMutate);
                resolve();     
              }
            }
            window.addEventListener('MutationEvent', onDOMMutate, false);          
          }); 
        }
        allTriggerPromises.push(elementExistsPromise);       
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
    if(webExperiments.length) StatsigCodeHelper._bindGlobalMutationObserver();
    for(const experiment of webExperiments) {
      const {key, triggers = {}, url} = experiment;
      
      // check url before the triggers
      if(url && !window.location.pathname.match(new RegExp(url))) {
        console.log(`URL condition not met for ${key}: ${url}, skipping...`);      
        continue;
      }
      console.log(`URL condition met for ${key}: ${url}, evaluating triggers...`);                  
      StatsigCodeHelper._awaitTriggersDoCallback(triggers, () => {
        StatsigCodeHelper._CONSOLE_DEBUG && console.log(`Activating test: ${key}`);
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