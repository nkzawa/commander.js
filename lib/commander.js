
/*!
 * commander
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , path = require('path')
  , basename = path.basename;

/**
 * Expose the root command.
 */

exports = module.exports = new Command;

/**
 * Expose `Command`.
 */

exports.Command = Command;

/**
 * Expose `Option`.
 */

exports.Option = Option;

/**
 * Initialize a new `Option` with the given `flags` and `description`.
 *
 * @param {String} flags
 * @param {String} description
 * @api public
 */

function Option(flags, description) {
  this.flags = flags;
  this.required = ~flags.indexOf('<');
  this.optional = ~flags.indexOf('[');
  this.bool = !~flags.indexOf('-no-');
  flags = flags.split(/[ ,|]+/)
  this.small = flags.shift();
  this.large = flags.shift();
  this.description = description;
}

/**
 * Return option name.
 *
 * @return {String}
 * @api private
 */

Option.prototype.name = function(){
  return this.large
    .replace('--', '')
    .replace('no-', '');
};

/**
 * Check if `arg` matches the small or large flag.
 *
 * @param {String} arg
 * @return {Boolean}
 * @api private
 */

Option.prototype.is = function(arg){
  return arg == this.small
    || arg == this.large;
};

/**
 * Initialize a new `Command`.
 *
 * @param {String} name
 * @api public
 */

function Command(name) {
  this.commands = [];
  this.options = [];
  this.args = [];
  this.name = name;
}

/**
 * Inherit from `EventEmitter.prototype`.
 */

Command.prototype.__proto__ = EventEmitter.prototype;

/**
 * Add command `name`.
 *
 * The `.action()` callback is invoked when the
 * command `name` is specified via __ARGV__,
 * and the remaining arguments are applied to the
 * function for access.
 *
 * When the `name` is "*" an un-matched command
 * will be passed as the first arg, followed by
 * the rest of __ARGV__ remaining.
 *
 * Examples:
 *
 *      program
 *        .version('0.0.1')
 *        .option('-C, --chdir <path>', 'change the working directory')
 *        .option('-c, --config <path>', 'set config path. defaults to ./deploy.conf')
 *        .option('-T, --no-tests', 'ignore test hook')
 *     
 *      program
 *        .command('setup')
 *        .description('run remote setup commands')
 *        .action(function(){
 *          console.log('setup');
 *        });
 *     
 *      program
 *        .command('exec <cmd>')
 *        .description('run the given remote command')
 *        .action(function(cmd){
 *          console.log('exec "%s"', cmd);
 *        });
 *     
 *      program
 *        .command('*')
 *        .description('deploy the given env')
 *        .action(function(env){
 *          console.log('deploying "%s"', env);
 *        });
 *     
 *      program.parse(process.argv);
  *
 * @param {String} name
 * @return {Command} the new command
 * @api public
 */

Command.prototype.command = function(name){
  var args = name.split(/ +/);
  var cmd = new Command(args.shift());
  this.commands.push(cmd);
  cmd.parseExpectedArgs(args);
  cmd.parent = this;
  return cmd;
};

/**
 * Parse expected `args`.
 *
 * For example `["[type]"]` becomes `[{ required: false, name: 'type' }]`.
 *
 * @param {Array} args
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.parseExpectedArgs = function(args){
  if (!args.length) return;
  var self = this;
  args.forEach(function(arg){
    switch (arg[0]) {
      case '<':
        self.args.push({ required: true, name: arg.slice(1, -1) });
        break;
      case '[':
        self.args.push({ required: false, name: arg.slice(1, -1) });
        break;
    }
  });
  return this;
};

/**
 * Register callback `fn` for the command.
 *
 * Examples:
 *
 *      program
 *        .command('help')
 *        .description('display verbose help')
 *        .action(function(){
 *           // output help here
 *        });
 *
 * @param {Function} fn
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.action = function(fn){
  var self = this;
  this.parent.on(this.name, function(args){
    self.args.forEach(function(arg, i){
      if (null == args[i]) {
        self.missingArgument(arg.name);
      }
    });
    fn.apply(this, args);
  });
  return this;
};

/**
 * Define option with `flags`, `description` and optional
 * coercion `fn`. 
 *
 * The `flags` string should contain both the small and large flags,
 * separated by comma, a pipe or space. The following are all valid
 * all will output this way when `--help` is used.
 *
 *    "-p, --pepper"
 *    "-p|--pepper"
 *    "-p --pepper"
 *
 * Examples:
 *
 *     // simple boolean defaulting to false
 *     program.option('-p, --pepper', 'add pepper');
 *
 *     --pepper
 *     program.pepper
 *     // => Boolean
 *
 *     // simple boolean defaulting to false
 *     program.option('-C, --no-cheese', 'remove cheese');
 *
 *     program.cheese
 *     // => true
 *
 *     --no-cheese
 *     program.cheese
 *     // => true
 *
 *     // required argument
 *     program.option('-C, --chdir <path>', 'change the working directory');
 *
 *     --chdir /tmp
 *     program.chdir
 *     // => "/tmp"
 *
 *     // optional argument
 *     program.option('-c, --cheese [type]', 'add cheese [cheddar]');
 *
 * @param {String} flags
 * @param {String} description
 * @param {Function} fn
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.option = function(flags, description, fn){
  var self = this
    , option = new Option(flags, description)
    , name = option.name();

  // when --no-* we default to true
  if (false == option.bool) self[name] = true;

  // register the option
  this.options.push(option);

  // when it's passed assign the value
  // and conditionally invoke the callback
  this.on(name, function(val){
    // coercion
    if (null != val && fn) val = fn(val);

    // assign value
    self[name] = null == val
      ? option.bool
      : val;
  });

  return this;
};

/**
 * Parse `argv`, settings options and invoking commands when defined.
 *
 * @param {Array} argv
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.parse = function(argv){
  // store raw args
  this.rawArgs = argv;

  // guess name
  if (!this.name) this.name = basename(argv[1]);

  // default options
  this.option('-h, --help', 'output usage information');
  this.on('help', function(){
    process.stdout.write(this.helpInformation());
    process.exit(0);
  });

  // process argv
  return this.parseArgs(this.parseOptions(this.normalize(argv)));
};

/**
 * Normalize `args`, splitting joined small flags. For example
 * the arg "-abc" is equivalent to "-a -b -c".
 *
 * @param {Array} args
 * @return {Array}
 * @api private
 */

Command.prototype.normalize = function(args){
  var ret = []
    , arg;

  for (var i = 0, len = args.length; i < len; ++i) {
    arg = args[i];
    if (arg.length > 1 && '-' == arg[0] && '-' != arg[1]) {
      arg.slice(1).split('').forEach(function(c){
        ret.push('-' + c);
      });
    } else {
      ret.push(arg);
    }
  }

  return ret;
};

/**
 * Parse command `args`.
 *
 * When listener(s) are available those
 * callbacks are invoked, otherwise the "*"
 * event is emitted and those actions are invoked.
 *
 * @param {Array} args
 * @return {Command} for chaining
 * @api private
 */

Command.prototype.parseArgs = function(args){
  var cmds = this.commands
    , len = cmds.length
    , name;

  if (args.length) {
    name = args[0];
    if (this.listeners(name).length) {
      this.emit(args.shift(), args);
    } else {
      this.emit('*', args);
    }
  }

  return this;
};

/**
 * Return an option matching `arg` if any.
 *
 * @param {String} arg
 * @return {Option}
 * @api private
 */

Command.prototype.optionFor = function(arg){
  for (var i = 0, len = this.options.length; i < len; ++i) {
    if (this.options[i].is(arg)) {
      return this.options[i];
    }
  }
};

/**
 * Parse options from `argv` returning `argv`
 * void of these options.
 *
 * @param {Array} argv
 * @return {Array}
 * @api public
 */

Command.prototype.parseOptions = function(argv){
  var args = []
    , argv = argv.slice(2)
    , len = argv.length
    , option
    , arg;

  // parse options
  for (var i = 0; i < len; ++i) {
    arg = argv[i];
    option = this.optionFor(arg);

    // option is defined
    if (option) {
      // requires arg
      if (option.required) {
        arg = argv[++i];
        if (null == arg) return this.optionMissingArgument(option);
        if ('-' == arg[0]) return this.optionMissingArgument(option, arg);
        this.emit(option.name(), arg);
      // optional arg
      } else if (option.optional) {
        arg = argv[i+1];
        if (null == arg || '-' == arg[0]) {
          arg = null;
        } else {
          ++i;
        }
        this.emit(option.name(), arg);
      // bool
      } else {
        this.emit(option.name());
      }
      continue;
    }
    
    // looks like an option
    if (arg.length > 1 && '-' == arg[0]) {
      this.unknownOption(arg);
    }
    
    // arg
    args.push(arg);
  }

  return args;
};

/**
 * Argument `name` is missing.
 *
 * @param {String} name
 * @api private
 */

Command.prototype.missingArgument = function(name){
  console.error();
  console.error("  error: missing required argument `%s'", name);
  console.error();
  process.exit(1);
};

/**
 * `Option` is missing an argument, but received `flag` or nothing.
 *
 * @param {String} option
 * @param {String} flag
 * @api private
 */

Command.prototype.optionMissingArgument = function(option, flag){
  console.error();
  if (flag) {
    console.error("  error: option `%s' argument missing, got `%s'", option.flags, flag);
  } else {
    console.error("  error: option `%s' argument missing", option.flags);
  }
  console.error();
  process.exit(1);
};

/**
 * Unknown option `flag`.
 *
 * @param {String} flag
 * @api private
 */

Command.prototype.unknownOption = function(flag){
  console.error();
  console.error("  error: unknown option `%s'", flag);
  console.error();
  process.exit(1);
};

/**
 * Set the program version to `str`.
 *
 * This method auto-registers the "-v, --version" flag
 * which will print the version number when passed.
 *
 * @param {String} str
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.version = function(str){
  if (0 == arguments.length) return this._version;
  this._version = str;
  this.option('-v, --version', 'output the version number');
  this.on('version', function(){
    console.log(str);
    process.exit(0);
  });
  return this;
};

/**
 * Set / get the command usage `str`.
 *
 * @param {String} str
 * @return {String|Command}
 * @api public
 */

Command.prototype.usage = function(str){
  if (0 == arguments.length) return this._usage || '[options]';
  this._usage = str;
  return this;
};

/**
 * Return the largest option length.
 *
 * @return {Number}
 * @api private
 */

Command.prototype.largestOptionLength = function(){
  return this.options.reduce(function(max, option){
    return Math.max(max, option.flags.length);
  }, 0);
};

/**
 * Return help for options.
 *
 * @return {String}
 * @api private
 */

Command.prototype.optionHelp = function(){
  var width = this.largestOptionLength();
  return this.options.map(function(option){
    return pad(option.flags, width)
      + '  ' + option.description;
  }).join('\n');
};

/**
 * Return command help documentation.
 *
 * @return {String}
 * @api private
 */

Command.prototype.commandHelp = function(){
  if (!this.commands.length) return '';
  return [
      ''
    , '  Commands:'
    , ''
    , this.commands.map(function(cmd){
      var args = cmd.args.map(function(arg){
        return arg.required
          ? '<' + arg.name + '>'
          : '[' + arg.name + ']';
      }).join(' ');
      return cmd.name + ' ' + args + '\n' + cmd.description();
    }).join('\n\n').replace(/^/gm, '    ')
    , ''
  ].join('\n');
};

/**
 * Return program help documentation.
 *
 * @return {String}
 * @api private
 */

Command.prototype.helpInformation = function(){
  return [
      ''
    , '  Usage: ' + this.name + ' ' + this.usage()
    , '' + this.commandHelp()
    , '  Options:'
    , ''
    , '' + this.optionHelp().replace(/^/gm, '    ')
    , ''
    , ''
  ].join('\n');
};

/**
 * Prompt for a `Number`.
 *
 * @param {String} str
 * @param {Function} fn
 * @api private
 */

Command.prototype.promptForNumber = function(str, fn){
  this.promptSingleLine(str, function(val){
    val = Number(val);
    if (isNaN(val)) return program.promptForNumber(str + '(must be a number) ', fn);
    fn(val);
  });
};

/**
 * Prompt for a `Date`.
 *
 * @param {String} str
 * @param {Function} fn
 * @api private
 */

Command.prototype.promptForDate = function(str, fn){
  this.promptSingleLine(str, function(val){
    val = new Date(val);
    if (isNaN(val.getTime())) return program.promptForDate(str + '(must be a date) ', fn);
    fn(val);
  });
};

/**
 * Single-line prompt.
 *
 * @param {String} str
 * @param {Function} fn
 * @api private
 */

Command.prototype.promptSingleLine = function(str, fn){
  if ('function' == typeof arguments[2]) {
    return this['promptFor' + (fn.name || fn)](str, arguments[2]);
  }

  process.stdout.write(str);
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', function(val){
    fn(val);
  }).resume();
};

/**
 * Multi-line prompt.
 *
 * @param {String} str
 * @param {Function} fn
 * @api private
 */

Command.prototype.promptMultiLine = function(str, fn){
  var buf = '';
  console.log(str);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function(val){
    if ('\n' == val) {
      process.stdin.removeAllListeners('data');
      fn(buf);
    } else {
      buf += val;
    }
  }).resume();
};

Command.prototype.prompt = function(str, fn){
  if (/ $/.test(str)) return this.promptSingleLine.apply(this, arguments);
  this.promptMultiLine(str, fn);
};

Command.prototype.confirm = function(str, fn){
  this.prompt(str, function(ok){
    fn(parseBool(ok));
  });
};

Command.prototype.choose = function(list, fn){
  var self = this;

  list.forEach(function(item, i){
    console.log('  %d) %s', i + 1, item);
  });

  function again() {
    self.prompt('  : ', function(val){
      val = parseInt(val, 10) - 1;
      if (null == list[val]) {
        again();
      } else {
        fn(val, list[val]);
      }
    });
  }

  again();
};

function parseBool(str) {
  return /^y|yes|ok|true$/i.test(str);
}

function pad(str, width) {
  var len = Math.max(0, width - str.length);
  return str + Array(len + 1).join(' ');
}