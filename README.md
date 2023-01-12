# code-injection

### Installation
Add this helper script to the `<head>` of your webpage
```
<script src="http://localhost/code-injection/src/index.js?apikey=[CLIENT-API-KEY]&configkey=[DYNAMIC-CONFIG-KEY]"></script>
```

### Statsig Setup

#### Dynamic Config
* Contains list of web tests with directions on where (`url`) and when (`triggers`) to activate the tests. 
* The `Config Key` should be used in the installation script as shown in the installation instructions above. 
* The top level entry should be `experiments`, which is an Array of `Experiment Objects`. 

```js
{
  experiments: [
    {
      key: 'simple_test',
      url: '/products/.*$|test(-static)?.html$',
      triggers: {
        interval_condition: {
          js: '(function() { return window.dataLayer.products; })();',
          timeout: 4000,
        },
        element_exists: {
          selector: 'img.pdp',
          continuous: true,
        },
        page_lifecycle: 'dom_ready',
      },
    },
    {
      key: 'payment_plan_page_test',
      url: '/payment-plan',
      triggers: {
        element_exists: 'section[data-component-name="collapsableplans"]',
      },
    },
  ]
}
```

**Experiment Object** definitions

| parameter | type | description         | required |
|-----------|--------|----------------------|----------|
| key       | string | An `experiment_key` in statsig. Any experiment keys defined here will be attempted to activate following the conventions defined below. | yes      |
| url       | string | A Regex expression that determines where an experiment should activate. This will be checked once when the tool is initialize. | yes      |
| triggers  | object | An object containing a set of trigger conditions | no   |
| triggers.interval_condition  | object | This condition is for checking a condition on the webpage using custom javascript to determine if a test should activate | no   |
| triggers.interval_condition.js  | string | This should be a javascript expression that returns boolean true or false | no   |
| triggers.interval_condition.timeout  | integer | This value determines how long to check for the condition. This dictates when to abort evaluating the js condition within a `setInterval` loop. | no   |
| triggers.element_exists  | object or string | This condition is for activating a test based on an element being pressent on a webpage. Note: You can provide a `selector` string as the value, which will do a one-time check for the element and then activate and run the experiment code. | no   |
| triggers.element_exists.selector  | string | The element selector to look for. | yes   |
| triggers.element_exists.continuous  | bool | Enabling this will continuously run the experiment code. When disabled, the experiment code will run only once | yes   |
| triggers.pageload_stage  | string | Options include `dom_ready` and `window_onload`. This will ensure that experiment and it's code doesn't run until A certain stage during pageload. `dom_ready` is will be when all nodes are written to DOM and it's ready to be modified. `window_onload` is later in the lifecycle, once all external assets have also been loaded.  | no   |

#### Experiment Parameters
Each experiment included in the Dynamic Config above must contain either a `code` parameter or `codeConfig` + `codeKey` parametes. 

- Use `code` to define variation javascript that will be executed when the test is activated and the user is assigned to a Group.

- Use the `codeConfig` + `codeKey` approach to reference a block of javascript defined within a Dynamic Config. This approach allows code to be reused across multiple experiments. The `codeConfig` parameter should indicate the Dynamic Config key that contains the code, the `codeKey` indicates the Object key within that Dynamic config that contains the javascript that should be executed when the test is activated and the user is assigned to a Group.
