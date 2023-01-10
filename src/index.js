window["StatsigCodeHelper"] = window["StatsigCodeHelper"] || {
  _pendingInjections: [],
  _addStatsigSdk: function(apiKey, nonce) {
    const script = document.createElement('script');
    if (nonce) {
      script.nonce = nonce;
    }
    script.src = 'https://cdn.jsdelivr.net/npm/statsig-js';
    script.addEventListener('load', () => {
      StatsigCodeHelper._setupStatsigSdk(apiKey);
    });
    document.head.appendChild(script);
  },

  injectDynamicCode: function(experimentId) {
    StatsigCodeHelper._pendingInjections.push(
      () => StatsigCodeHelper._runInjectedCode(experimentId)
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

  _runInjectedCode: function(experimentId) {
    const config = statsig.getExperiment(experimentId);
    let code = config.get('code', null);
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

  _setupStatsigSdk: async function(apiKey) {
    if (!window['statsig']) {
      return;
    }
    if (!window.statsig.instance) {
      await statsig.initialize(apiKey, {});
      StatsigCodeHelper._sdkInitialized = true;
      StatsigCodeHelper._processPendingInjections();
    }
  },
}

if (document.currentScript && document.currentScript.src) {
  const url = new URL(document.currentScript.src);
  const apiKey = url.searchParams.get('apikey');
  if (apiKey) {
    StatsigCodeHelper._addStatsigSdk(apiKey, document.currentScript.nonce);
  }
}