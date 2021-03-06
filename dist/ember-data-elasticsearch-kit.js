(function() {
  window.EDEK = window.EmberDataElasticsearchKit = Ember.Namespace.create({
    VERSION: '1.0.0'
  });

}).call(this);

(function() {
  DS.ElasticSearchAdapter = DS.Adapter.extend({
    buildURL: function() {
      var host, namespace, url;
      host = Ember.get(this, "host");
      namespace = Ember.get(this, "namespace");
      url = [];
      if (host) {
        url.push(host);
      }
      if (namespace) {
        url.push(namespace);
      }
      url.push(Ember.get(this, "url"));
      url = url.join("/");
      if (!host) {
        url = "/" + url;
      }
      return url;
    },
    ajax: function(url, type, normalizeResponce, hash) {
      return this._ajax('%@/%@'.fmt(this.buildURL(), url || ''), type, normalizeResponce, hash);
    },
    _ajax: function(url, type, normalizeResponce, hash) {
      var adapter;
      if (hash == null) {
        hash = {};
      }
      adapter = this;
      return new Ember.RSVP.Promise(function(resolve, reject) {
        var headers;
        if (url.split("/").pop() === "") {
          url = url.substr(0, url.length - 1);
        }
        hash.url = url;
        hash.type = type;
        hash.dataType = 'json';
        hash.contentType = 'application/json; charset=utf-8';
        hash.context = adapter;
        if (hash.data && type !== 'GET') {
          hash.data = JSON.stringify(hash.data);
        }
        if (adapter.headers) {
          headers = adapter.headers;
          hash.beforeSend = function(xhr) {
            return forEach.call(Ember.keys(headers), function(key) {
              return xhr.setRequestHeader(key, headers[key]);
            });
          };
        }
        if (!hash.success) {
          hash.success = function(json) {
            var _modelJson;
            _modelJson = normalizeResponce.call(adapter, json);
            return Ember.run(null, resolve, _modelJson);
          };
        }
        hash.error = function(jqXHR, textStatus, errorThrown) {
          if (jqXHR) {
            jqXHR.then = null;
          }
          return Ember.run(null, reject, jqXHR);
        };
        return Ember.$.ajax(hash);
      });
    },
    find: function(store, type, id) {
      var normalizeResponce;
      normalizeResponce = function(data) {
        var _modelJson;
        _modelJson = {};
        _modelJson[type.typeKey] = data['_source'];
        return _modelJson;
      };
      return this.ajax(id, 'GET', normalizeResponce);
    },
    findMany: function(store, type, ids) {
      var data, normalizeResponce;
      data = {
        ids: ids
      };
      normalizeResponce = function(data) {
        var json;
        json = {};
        json[Ember.String.pluralize(type.typeKey)] = data['docs'].getEach('_source');
        return json;
      };
      return this.ajax('_mget', 'POST', normalizeResponce, {
        data: data
      });
    },
    findQuery: function(store, type, query, modelArray) {
      var normalizeResponce;
      normalizeResponce = function(data) {
        var json, _type,
          _this = this;
        json = {};
        _type = Ember.String.pluralize(type.typeKey);
        modelArray.set('total', data['hits'].total);
        json[_type] = data['hits']['hits'].getEach('_source');
        if (data.facets) {
          Object.keys(data.facets).forEach(function(key) {
            return modelArray.set(key, data.facets[key]);
          });
        }
        json[_type].forEach(function(item) {
          if (item._id && !item.id) {
            return item.id = item._id;
          }
        });
        if (query.fields && query.fields.length === 0) {
          json[_type] = data['hits']['hits'].getEach('_id');
        }
        return json;
      };
      return this.ajax('_search', 'POST', normalizeResponce, {
        data: query
      });
    },
    createRecord: function(store, type, record) {
      var normalizeResponce, rawJson;
      rawJson = store.serializerFor(type.typeKey).serialize(record);
      normalizeResponce = function(data) {
        var id, json;
        json = {};
        id = data._id || data.id;
        json[type.typeKey] = $.extend({
          id: id
        }, rawJson);
        return json;
      };
      return this.ajax('', 'POST', normalizeResponce, {
        data: rawJson
      });
    },
    updateRecord: function(store, type, record) {
      var normalizeResponce, rawJson;
      rawJson = store.serializerFor(type.typeKey).serialize(record);
      normalizeResponce = function(data) {
        var json;
        rawJson.id = data._id;
        json = {};
        json[type.typeKey] = rawJson;
        return json;
      };
      return this.ajax(record.get('id'), 'PUT', normalizeResponce, {
        data: rawJson
      });
    },
    deleteRecord: function(store, type, record) {
      return this.ajax(record.get('id'), 'DELETE', (function() {}));
    }
  });

}).call(this);

(function() {
  EDEK.ArrayTransform = DS.Transform.extend({
    deserialize: function(serialized) {
      switch (Em.typeOf(serialized)) {
        case 'array':
          return serialized;
        case 'string':
          return serialized.split(',').map(function(item) {
            return jQuery.trim(item);
          });
        default:
          return [];
      }
    },
    serialize: function(deserialized) {
      switch (Em.typeOf(deserialized)) {
        case "array":
          return deserialized;
        default:
          return [];
      }
    }
  });

}).call(this);

(function() {
  EDEK.QueryDSL = (function() {
    QueryDSL._query = {};

    function QueryDSL(_query) {
      this._query = _query;
    }

    QueryDSL.query = function(fun) {
      this._query = {
        query: {}
      };
      fun.call(new QueryDSL(this._query.query));
      return this._query;
    };

    QueryDSL.filter = function(fun) {
      this._query = {
        filter: {}
      };
      fun.call(new QueryDSL(this._query.filter));
      return this._query;
    };

    QueryDSL.facets = function(fun) {
      this._query = {
        facets: {}
      };
      fun.call(new QueryDSL(this._query.facets));
      return this._query;
    };

    QueryDSL.prototype.facets = function(fun) {
      var opts;
      opts = fun.call(this);
      return QueryDSL._query.facets = opts;
    };

    QueryDSL.prototype.query = function(options, fun) {
      return this._addWithFunction('query', options, fun);
    };

    QueryDSL.prototype.filter = function(options, fun) {
      return this._addWithFunction('filter', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/match-query/
    */


    QueryDSL.prototype.match = function(options, fun) {
      return this._add('match', options, fun);
    };

    QueryDSL.prototype.match_phrase = function(options) {
      return this._add('match_phrase', options);
    };

    QueryDSL.prototype.match_phrase_prefix = function(options) {
      return this._add('match_phrase_prefix', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/multi-match-query/
    */


    QueryDSL.prototype.multi_match = function(options) {
      return this._add('multi_match', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/ids-query/
    */


    QueryDSL.prototype.ids = function(options) {
      return this._add('ids', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/field-query/
    */


    QueryDSL.prototype.field = function(options) {
      return this._add('field', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/flt-query/
    */


    QueryDSL.prototype.flt = function(options) {
      return this._add('fuzzy_like_this', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/flt-field-query/
    */


    QueryDSL.prototype.flt_field = function(options) {
      return this.fuzzy_like_this_field(options);
    };

    QueryDSL.prototype.fuzzy_like_this_field = function(options) {
      return this._add('fuzzy_like_this_field', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/fuzzy-query/
    */


    QueryDSL.prototype.fuzzy = function(options) {
      return this._add('fuzzy', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/match-all-query/
    */


    QueryDSL.prototype.match_all = function(options) {
      if (options == null) {
        options = {};
      }
      return this._add('match_all', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/mlt-query/
    */


    QueryDSL.prototype.mlt = function(options) {
      return this.more_like_this(options);
    };

    QueryDSL.prototype.more_like_this = function(options) {
      return this._add('more_like_this', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/mlt-field-query/
    */


    QueryDSL.prototype.more_like_this_field = function(options) {
      return this._add('more_like_this_field', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/prefix-query/
    */


    QueryDSL.prototype.prefix = function(options) {
      return this._add('prefix', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/query-string-query/
    */


    QueryDSL.prototype.query_string = function(options) {
      return this._add('query_string', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/range-query/
    */


    QueryDSL.prototype.range = function(options) {
      return this._add('range', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/regexp-query/
    */


    QueryDSL.prototype.regexp = function(options) {
      return this._add('regexp', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/term-query/
    */


    QueryDSL.prototype.term = function(options) {
      return this._add('term', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/terms-query/
    */


    QueryDSL.prototype.terms = function(options) {
      return this._add('terms', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/common-terms-query/
    */


    QueryDSL.prototype.common = function(options) {
      return this._add('common', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/wildcard-query/
    */


    QueryDSL.prototype.wildcard = function(options) {
      return this._add('wildcard', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/text-query/
    */


    QueryDSL.prototype.text = function(options) {
      return this._add('text', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/geo-shape-query/
    */


    QueryDSL.prototype.geo_shape = function(options) {
      return this._add('geo_shape', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/bool-query/
    */


    QueryDSL.prototype.bool = function(options, fun) {
      return this._addWithFunction('bool', options, fun);
    };

    QueryDSL.prototype.must = function(options, fun) {
      return this._addWithFunction('must', options, fun, []);
    };

    QueryDSL.prototype.must_not = function(options, fun) {
      return this._addWithFunction('must_not', options, fun, []);
    };

    QueryDSL.prototype.should = function(options, fun) {
      return this._addWithFunction('should', options, fun, []);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/boosting-query/
    */


    QueryDSL.prototype.boosting = function(options, fun) {
      return this._addWithFunction('boosting', options, fun);
    };

    QueryDSL.prototype.positive = function(options, fun) {
      return this._addWithFunction('positive', options, fun);
    };

    QueryDSL.prototype.negative = function(options, fun) {
      return this._addWithFunction('negative', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/custom-score-query/
    */


    QueryDSL.prototype.custom_score = function(options, fun) {
      return this._addWithFunction('custom_score', options, fun);
    };

    QueryDSL.prototype.params = function(options) {
      return this._add('params', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/constant-score-query/
    */


    QueryDSL.prototype.constant_score = function(options, fun) {
      return this._addWithFunction('constant_score', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/custom-boost-factor-query/
    */


    QueryDSL.prototype.custom_boost_factor = function(options, fun) {
      return this._addWithFunction('custom_boost_factor', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/dis-max-query/
    */


    QueryDSL.prototype.dis_max = function(options, fun) {
      return this._addWithFunction('dis_max', options, fun);
    };

    QueryDSL.prototype.queries = function(options, fun) {
      return this._addWithFunction('queries', options, fun, []);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/filtered-query/
    */


    QueryDSL.prototype.filtered = function(options, fun) {
      return this._addWithFunction('filtered', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/has-child-query/
    */


    QueryDSL.prototype.has_child = function(options, fun) {
      return this._addWithFunction('has_child', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/has-parent-query/
    */


    QueryDSL.prototype.has_parent = function(options, fun) {
      return this._addWithFunction('has_parent', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/span-first-query/
    */


    QueryDSL.prototype.span_first = function(options, fun) {
      return this._addWithFunction('span_first', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/span-multi-term-query/
    */


    QueryDSL.prototype.span_multi = function(options, fun) {
      return this._addWithFunction('span_multi', options, fun);
    };

    QueryDSL.prototype.span_term = function(options, fun) {
      return this._add('span_term', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/span-near-query/
    */


    QueryDSL.prototype.span_near = function(options, fun) {
      return this._addWithFunction('span_near', options, fun);
    };

    QueryDSL.prototype.clauses = function(options, fun) {
      return this._addWithFunction('clauses', options, fun, []);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/span-not-query/
    */


    QueryDSL.prototype.span_not = function(options, fun) {
      return this._addWithFunction('span_not', options, fun);
    };

    QueryDSL.prototype.include = function(options, fun) {
      return this._addWithFunction('include', options, fun);
    };

    QueryDSL.prototype.exclude = function(options, fun) {
      return this._addWithFunction('exclude', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/span-or-query/
    */


    QueryDSL.prototype.span_or = function(options, fun) {
      return this._addWithFunction('span_or', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/top-children-query/
    */


    QueryDSL.prototype.top_children = function(options, fun) {
      return this._addWithFunction('top_children', options, fun);
    };

    QueryDSL.prototype.nested = function(options, fun) {
      return this._addWithFunction('nested', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/custom-filters-score-query/
    */


    QueryDSL.prototype.custom_filters_score = function(options, fun) {};

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/indices-query/
    */


    QueryDSL.prototype.indices = function(options, fun) {
      return this._addWithFunction('indices', options, fun);
    };

    QueryDSL.prototype.no_match_query = function(options, fun) {
      return this._addWithFunction('no_match_query', options, fun);
    };

    QueryDSL.prototype.filters = function(options, fun) {
      return this._addWithFunction('filters', options, fun, []);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/and-filter/
    */


    QueryDSL.prototype.and = function(options, fun) {
      return this._addWithFunction('and', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/exists-filter/
    */


    QueryDSL.prototype.exists = function(options) {
      return this._add('exist', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/limit-filter/
    */


    QueryDSL.prototype.limit = function(options) {
      return this._add('limit', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/type-filter/
    */


    QueryDSL.prototype.type = function(options) {
      return this._add('type', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/geo-bounding-box-filter/
    */


    QueryDSL.prototype.geo_bounding_box = function(options) {
      return this._add('geo_bounding_box', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/geo-distance-filter/
    */


    QueryDSL.prototype.geo_distance = function(options) {
      return this._add('geo_distance', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/geo-distance-range-filter/
    */


    QueryDSL.prototype.geo_distance_range = function(options) {
      return this._add('geo_distance_range', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/geo-polygon-filter/
    */


    QueryDSL.prototype.geo_polygon = function(options) {
      return this._add('geo_polygon', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/missing-filter/
    */


    QueryDSL.prototype.missing = function(options) {
      return this._add('missing', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/not-filter/
    */


    QueryDSL.prototype.not = function(options, fun) {
      return this._addWithFunction('not', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/numeric-range-filter/
    */


    QueryDSL.prototype.numeric_range = function(options) {
      return this._add('numeric_range', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/or-filter/
    */


    QueryDSL.prototype.or = function(options, fun) {
      return this._addWithFunction('or', options, fun);
    };

    /*
      http://www.elasticsearch.org/guide/reference/query-dsl/script-filter/
    */


    QueryDSL.prototype.script = function(options) {
      return this._add('script', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/api/search/facets/histogram-facet/
    */


    QueryDSL.prototype.histogram = function(options) {
      return this._add('histogram', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/api/search/facets/date-histogram-facet/
    */


    QueryDSL.prototype.date_histogram = function(options) {
      return this._add('date_histogram', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/api/search/facets/statistical-facet/
    */


    QueryDSL.prototype.statistical = function(options) {
      return this._add('statistical', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/api/search/facets/terms-stats-facet/
    */


    QueryDSL.prototype.terms_stats = function(options) {
      return this._add('terms_stats', options);
    };

    /*
      http://www.elasticsearch.org/guide/reference/api/search/facets/geo-distance-facet/
    */


    QueryDSL.prototype.geo_distance = function(options) {
      return this._add('geo_distance', options);
    };

    QueryDSL.prototype._extractFun = function(options, fun, optionsType) {
      var _options;
      if (optionsType == null) {
        optionsType = {};
      }
      if (typeof options === 'function') {
        fun = options;
        _options = optionsType;
      } else {
        _options = options;
      }
      return [_options, fun];
    };

    QueryDSL.prototype._add = function(type, options, fun) {
      var params;
      if (fun || typeof options === 'function') {
        return this._addWithFunction(type, options, fun);
      } else {
        params = {};
        params[type] = options;
        if (this._query["push"]) {
          this._query.push(params);
        } else {
          this._query[type] = options;
        }
        return params;
      }
    };

    QueryDSL.prototype._addWithFunction = function(type, options, fun, optionsType) {
      var _options, _ref;
      if (optionsType == null) {
        optionsType = {};
      }
      _ref = this._extractFun(options, fun, optionsType), _options = _ref[0], fun = _ref[1];
      _options = this._add(type, _options);
      if (fun) {
        return fun.call(new QueryDSL(_options[type]));
      }
    };

    return QueryDSL;

  })();

}).call(this);

(function() {
  EDEK.MappingDSL = (function() {
    MappingDSL.mapping = function(options, fun) {
      this._mappings = {
        mappings: {}
      };
      if (fun) {
        this._mappings.settings = options;
      } else {
        fun = options;
      }
      fun.call(new EDEK.MappingDSL(this._mappings.mappings));
      return this._mappings;
    };

    MappingDSL.create = function(url, json) {
      var hash,
        _this = this;
      this.responce = void 0;
      hash = {};
      hash.url = url;
      hash.type = "PUT";
      hash.dataType = 'json';
      hash.async = false;
      hash.contentType = 'application/json; charset=utf-8';
      hash.data = JSON.stringify(json);
      hash.success = function(data) {
        return _this.responce = data;
      };
      Ember.$.ajax(hash);
      return this.responce;
    };

    MappingDSL["delete"] = function(url) {
      var hash,
        _this = this;
      this.responce = void 0;
      hash = {};
      hash.url = url;
      hash.type = "DELETE";
      hash.async = false;
      hash.success = function(data) {
        return _this.responce = data;
      };
      Ember.$.ajax(hash);
      return this.responce;
    };

    function MappingDSL(_mappings) {
      this._mappings = _mappings;
    }

    MappingDSL.prototype.mapping = function(type, options, fun) {
      var mappings;
      mappings = {};
      if (fun || typeof options === 'function') {
        if (typeof options !== 'function') {
          options.properties = {};
          mappings = options;
        } else {
          fun = options;
          mappings.properties = {};
        }
        this._mappings[type] = mappings;
        return fun.call(new EDEK.MappingDSL(mappings.properties));
      } else {
        return this._mappings[type] = options || mappings;
      }
    };

    return MappingDSL;

  })();

}).call(this);

(function() {
  EDEK.BulkDSL = (function() {
    BulkDSL.store = function(options, fun) {
      this.documents = [];
      fun.call(new EDEK.BulkDSL(options, this.documents));
      return this.request(options, this.documents);
    };

    BulkDSL.url = function(options) {
      return "%@/%@".fmt(options.host, "_bulk");
    };

    BulkDSL.request = function(options, json) {
      var hash,
        _this = this;
      this.responce = void 0;
      hash = {};
      hash.url = this.url(options);
      hash.type = "POST";
      hash.dataType = 'json';
      hash.async = false;
      hash.contentType = 'application/json; charset=utf-8';
      hash.data = json.join("\n");
      hash.success = function(data) {
        return _this.responce = data;
      };
      Ember.$.ajax(hash);
      return this.responce;
    };

    BulkDSL.refresh = function(url) {
      var hash;
      hash = {};
      hash.url = "%@/_refresh".fmt(url);
      hash.async = false;
      hash.type = 'POST';
      hash.contentType = 'application/json; charset=utf-8';
      return Ember.$.ajax(hash);
    };

    function BulkDSL(options, documents) {
      this.options = options;
      this.documents = documents;
      this.meta = ["_type", "_index"];
      this._index = this.options.index;
      this._type = this.options.type || "document";
    }

    BulkDSL.prototype.create = function(options) {
      this.documents.push(JSON.stringify({
        create: this._createHeader(options)
      }));
      return this.documents.push(JSON.stringify(options));
    };

    BulkDSL.prototype["delete"] = function(options) {
      this.documents.push(JSON.stringify({
        "delete": this._createHeader(options)
      }));
      return this.documents.push(JSON.stringify(options));
    };

    BulkDSL.prototype.index = function(options) {
      this.documents.push(JSON.stringify({
        index: this._createHeader(options)
      }));
      return this.documents.push(JSON.stringify(options));
    };

    BulkDSL.prototype.update = function(options) {
      this.documents.push(JSON.stringify({
        update: this._createHeader(options)
      }));
      return this.documents.push(JSON.stringify(options));
    };

    BulkDSL.prototype._createHeader = function(options) {
      var headers,
        _this = this;
      headers = {};
      ["_type", "_index", "_version", "_routing", "_refresh", "_percolate", "_parent", "_timestamp", "_ttl"].forEach(function(type) {
        if (_this.meta.indexOf(type) >= 0) {
          if (!options[type]) {
            headers[type] = _this[type];
          } else {
            headers[type] = options[type];
            delete options[type];
          }
        } else {
          if (options[type]) {
            headers[type] = options[type];
            delete options[type];
          }
        }
        return headers._id = options.id;
      });
      return headers;
    };

    return BulkDSL;

  })();

}).call(this);
