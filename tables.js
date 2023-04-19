// TODO:
// rename to more sensible names
// n-ary predicates
// functions
// second order quantifiers
const CURRENT = {}
const TEMPLATES = {}
function update_current(type, template_num, initialisation=false) {
	if (isNaN(template_num)) {
		// custom
		TEMPLATES[type].values[-1] = [...document.querySelectorAll(`input[name="${type}"][value=custom]~fieldset input`)].map(input => input.value);
		template_num = -1
	}
	TEMPLATES[type].selected = template_num;
	CURRENT[type] = TEMPLATES[type].values[template_num];

	// keep css in sync
	if (type == 'TRUE_FALSE_SYMBOLS')
	for (const [i, val] of Object.entries(CURRENT[type]))
		document.body.style.setProperty(`--${type}-${i}`, JSON.stringify(val||" "));

	if (!initialisation)
		update_connective_tables()
}
function add_template(type, template_name, values) {
	TEMPLATES[type].names.push(template_name)
	TEMPLATES[type].values.push(values)
}
TEMPLATES["CONNECTIVES"] = {name: "Connective Symbols", fields: 6, names: [], values: []}
add_template("CONNECTIVES", "Modern Logic", ['¬', '∧', '∨', '⊻', '→', '↔', "∀", "∃"])
add_template("CONNECTIVES", "Traditional Logic", ['~', '∧', '∨', '⊻', '⊃', '≡', "∀", "∃"])
add_template("CONNECTIVES", "Programming", ['!', '&', '|', '^', '→', '==', "∀", "∃"])
add_template("CONNECTIVES", "Algebra", ['¬', '•', '+', '⊕', '→', '≡', "∀", "∃"])
update_current("CONNECTIVES", 0, true)

TEMPLATES["TRUE_FALSE_SYMBOLS"] = {name: "Truth Symbols", hide_fields:true, fields: 2, names: [], values: []}
add_template("TRUE_FALSE_SYMBOLS", "T/F", ['F', 'T', ''])
add_template("TRUE_FALSE_SYMBOLS", "1/0", ['0', '1', ''])
add_template("TRUE_FALSE_SYMBOLS", "⊤/⊥", ['⊥', '⊤', ' '])
update_current("TRUE_FALSE_SYMBOLS", 0, true)

class Token {
	constructor(string, stack=[], override_type=false) {
		
		var type
		if (override_type) {
			type = TYPES.filter(x=>x.name==override_type)[0]
			this.characters_consumed = string.length
		}
		else {
			var longest_match = 0
			type = null
			for (let i=0; i<TYPES.length; i++) {
				if (TYPES[i].disabled) continue
				for (let j=0; j<TYPES[i].aliases.length; j++) {
					if (TYPES[i].aliases[j].length > longest_match && string.startsWith(TYPES[i].aliases[j])) {
						type = TYPES[i]
						longest_match = TYPES[i].aliases[j].length
					}
				}
			}
			if (type == null) throw "Unrecognised token starting from: "+string
			this.characters_consumed = longest_match
		}
		
		if (type.custom_display) {
			if (typeof(type.custom_display) == "string") this.symbol = type.custom_display
			else {
				let [setting, index] = type.custom_display;
				this.symbol = CURRENT[setting][index]
			}
		} else this.symbol = string.slice(0, this.characters_consumed)
		
		this.type = type
		this.pre_args = type.pre_args(this.symbol) || 0
		this.post_args = type.post_args(this.symbol) || 0
		this.valuate = type.valuate
		this.index = type.index
		
		collapseStack(stack)
		this.args = []
		for (let i = 0; i < this.pre_args; i++) {
			let topOfStack = stack.pop()
			if (!topOfStack.complete) console.log("uh oh! "+topOfStack+" isnt complete but its being used as an arg!")
			this.args.push(topOfStack)
		}
		
		this.args_needed = this.post_args
		this.complete = this.args_needed == 0
		this.parenthesised = false

		if (type == BOUND_VARIABLES) {
			this.depth_from_quantifier = BOUND_VARIABLES.aliases.length - BOUND_VARIABLES.aliases.lastIndexOf(this.symbol)
			//console.log(this.symbol, BOUND_VARIABLES.aliases.toString(), this.depth_from_quantifier)
		}
	}
	
	add(token) {
		if (this.args_needed < 1) throw "too many arguments supplied"
		this.args_needed --
		this.args.push(token)
		if (this.args_needed == 0) this.complete = true
		if (this.type.quantifier) {
			if (this.complete)
				BOUND_VARIABLES.aliases.pop()
			else {
				BOUND_VARIABLES.aliases.push(token.symbol)
				token.type = BINDING_VARIABLE
			}
		}
	}
	
	extractConstants() {
		if (this.type == CONSTANTS) return [this.symbol]
		return this.args.flatMap(x=>x.extractConstants())
	}
	extractBoundVars() {
		if (this.type == BINDING_VARIABLE) return [this.depth-1, this.symbol]
		return this.args.flatMap(x=>x.extractBoundVars())
	}
	
	calcQuantifierHeight(depth=0) {
		this.depth = depth
		if (this.type.quantifier)
			depth++
		if (this.type == BINDING_VARIABLE) this.depth--
		return Math.max(0, ...this.args.map(x=>x.calcQuantifierHeight(depth))) + (this.type.quantifier!=false) 
	}

	toString() {
		if (this.pre_args === 0 && this.post_args === 0) return this.symbol
		return this.symbol + this.depth + "{" + this.args.map(x=>x.toString()).concat(Array(this.args_needed).fill('_')).join(',') + "}"
	}
}

const TYPES = []
class TokenType {
	constructor(name, symbols='', {post_args=()=>0, pre_args=()=>0, args, valuate=()=>INDETERMINATE, display=false, quantifier=false, index, disabled} = {}, fullname) {
		this.name = name
		this.fullname = fullname
		this.aliases = typeof(symbols)=="string" ? symbols.split('') : symbols;
		if (args) {
			this.pre_args  = s=>args(s)[0]
			this.post_args = s=>args(s)[1]
		} else {
			this.pre_args  = typeof(pre_args) =="number"? ()=>pre_args : pre_args
			this.post_args = typeof(post_args)=="number"? ()=>post_args : post_args
		}
		this.custom_display = display
		this.valuate = typeof(valuate)=="function" ? valuate 
			: function(_) { return this.args.reduce((vals,arg)=>vals[+arg.valuate(_)], valuate) }  // truth table [[0, 1], [1, 1]] -> function args[0].valuate() || args[1].valuate()
		this.quantifier = quantifier
		this.index = index || function(_){return this.type.aliases.indexOf(this.symbol)}
		this.disabled = disabled
		TYPES.push(this)
	}
}

const INDETERMINATE = 2

new TokenType("(", "(")
const BOUND_VARIABLES = new TokenType("bound_variable", "", {
	index: function ([_,__,quantifier_choices]) {  return quantifier_choices[this.depth - this.depth_from_quantifier] } })
const VARIABLES = new TokenType("variable")
const relation_argcounts = []
const RELATIONS = new TokenType("relation", "", {args: s=> relation_argcounts[RELATIONS.aliases.indexOf(s)], 
	valuate: function(struct){ return this.args.reduce((t,c)=>t[c.index(struct)], struct[1][this.index(struct)]) } })
new TokenType("negation", ['!', '~', '¬', '\\lnot', 'NOT'], {post_args:1, display:['CONNECTIVES',0], 
	valuate: [1,0,INDETERMINATE] }, "Negation (NOT)")
new TokenType("disjunction", ['v', '∨', '|', '||', '+', '\\lor', 'OR', '\\/'], {pre_args:1, post_args:1, display:['CONNECTIVES',2], 
	valuate: [[0,1,INDETERMINATE],[1,1,1],[INDETERMINATE,1,INDETERMINATE]] }, "Inclusive Disjunction (OR)")
new TokenType("exclusive_disjunction", ['^', '⊻', '⊕', '\\oplus', 'XOR'], {pre_args:1, post_args:1, display:['CONNECTIVES',3], 
	valuate: [[0,1,INDETERMINATE],[1,0,INDETERMINATE],[INDETERMINATE,INDETERMINATE,INDETERMINATE]] }, "Exclusive Disjunction (XOR)")
new TokenType("conjunction", ['&', '∧', '^', '&&', '•', '.', '\\land', 'AND', '/\\'], {pre_args:1, post_args:1, display:['CONNECTIVES',1], 
	valuate: [[0,0,0],[0,1,INDETERMINATE],[0,INDETERMINATE,INDETERMINATE]] }, "Conjunction (AND)")
new TokenType("implication", ['>', '→', '⊃', '\\implies', '->', 'IMPLIES'], {pre_args:1, post_args:1, display:['CONNECTIVES',4], 
	valuate: [[1,1,1],[0,1,INDETERMINATE], [INDETERMINATE,1,INDETERMINATE]] }, "Material Implication")
new TokenType("bi-implication", ['<>', '<->', '=', '==', '\\leftrightarrow', 'IFF'], {pre_args:1, post_args:1, display:['CONNECTIVES',5],
	valuate: [[1,0,INDETERMINATE],[0,1,INDETERMINATE], [INDETERMINATE,INDETERMINATE,INDETERMINATE]] }, "Equivalence")
new TokenType("postfix operator", "'", {pre_args:1, valuate:function(_){return this.args[0].valuate(_)}})
new TokenType("universal_quantifier", ["A", "∀"], {post_args:2, display:["CONNECTIVES",6], quantifier: "VARIABLES",
	valuate: function ([cm,rm,quantifier_choices]) { 
		let indetermined = false
		for (let i=0; i<VARIABLES.aliases.length; i++) { 
			let val = this.args[1].valuate([cm,rm,quantifier_choices.slice(0,this.depth).concat(i)])
			if (val == false) return false
			if (val == INDETERMINATE) indetermined = true
		}
		return indetermined ? INDETERMINATE : true
	} }, "Universal Quantifier")
new TokenType("existential_quantifier", ["E", "∃"], {post_args:2, display:["CONNECTIVES",7], quantifier: "VARIABLES",
	valuate: function ([cm,rm,quantifier_choices]) { 
		let indetermined = false
		for (let i=0; i<VARIABLES.aliases.length; i++) { 
			let val = this.args[1].valuate([cm,rm,quantifier_choices.slice(0,this.depth).concat(i)])
			if (val == true) return true
			if (val == INDETERMINATE) indetermined = true
		}
		return indetermined ? INDETERMINATE : false
	} }, "Existential Quantifier")
new TokenType("falsum", ['#','F','⊥','0','\\bot'], {display:['TRUE_FALSE_SYMBOLS',0],
	valuate: false }, "False / Falsum / Contradiction")
new TokenType("verum", ['T','1','⊥','\\top'], { display:['TRUE_FALSE_SYMBOLS',1],
	valuate: true }, "Truth / Verum")
const CONSTANTS = new TokenType("constant", "", {
	valuate: function([const_map]){return const_map[this.symbol]} })
const BINDING_VARIABLE = new TokenType("binding_variable", "", {disabled:true})

function scan(txt) {
	var stack = []
	var i = 0, lastRecognised = 0
	BOUND_VARIABLES.aliases = []
	while (i < txt.length) {
		if (txt[i] == ')') {
			collapseStack(stack)
			let top_of_stack = stack.pop()
			if (stack.pop().type.name != "(") throw "multiple tokens inside parentheses!!!"
			top_of_stack.parenthesised = true
			stack.push(top_of_stack)
			i += 1
			lastRecognised = i
		} else {
			try {
				// attempt to recognise token
				let t = new Token(txt.slice(i), stack)
				if (i != lastRecognised) {
				}
				stack.push(t)
				i += t.characters_consumed
				lastRecognised = i
			} catch (e) {
				// not a recognised token, treat as a constant.
				if (i == lastRecognised) {
					if (txt[i] == ' ') {
						i++;
						lastRecognised++;
						continue
					}
				} else {
					stack.pop()
				}
				i++;
				stack.push(new Token(txt.slice(lastRecognised, i).trim(), stack, "constant"))
				var forced = true
			}
		}
	}
	collapseStack(stack)
	return stack
}
function collapseStack(stack) {
	while (stack.length > 1 && stack[stack.length-1].complete && stack[stack.length-1].type.name != '(' && !stack[stack.length-2].complete) {
		stack[stack.length-2].add(stack.pop())
	}
}
FORCE_PARENTHESES = false
function appendPhraseToTR(tr, token, elm='td', main_operator=false) {
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised) {
		let td = document.createElement(elm)
		td.innerText = '('
		tr.appendChild(td)
	}
	for (let i = 0; i < token.pre_args; i++) appendPhraseToTR(tr, token.args[i], elm);
	let td = document.createElement(elm)
	td.innerText = token.symbol
	if (main_operator) td.classList.add('mainOperator')
	tr.appendChild(td)
	for (let i = token.pre_args; i < token.pre_args+token.post_args; i++) appendPhraseToTR(tr, token.args[i], elm);
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised) {
		let td = document.createElement(elm)
		td.innerText = ')'
		tr.appendChild(td)
	}
}

function appendValuationToTR(tr, token, structure, height, from_depth, elm='td', main_operator=false) {
	if ((FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised) && token.depth > from_depth) {
		let td = document.createElement(elm)
		td.rowSpan = VARIABLES.aliases.length ** (height - token.depth)
		td.innerText = '('
		td.classList.add("parentheses")
		tr.appendChild(td);
	}
	
	for (let i = 0; i < token.pre_args; i++) appendValuationToTR(tr, token.args[i], structure, height, from_depth, elm);


	//console.log(token.symbol, token.depth, from_depth, height)
	if (token.depth > from_depth) {
		let td = document.createElement(elm)
		td.rowSpan = VARIABLES.aliases.length ** (height - token.depth)
		tr.appendChild(td)
		if (main_operator) td.classList.add('mainOperator');
		td.classList.add(token.type.name);

		var valuation = token.valuate(structure) *1
		//console.log(token.symbol, token.valuate(structure), structure, token.args)
		if (isNaN(valuation)) valuation = INDETERMINATE;
		td.innerText = CURRENT.TRUE_FALSE_SYMBOLS[valuation]
	}

	for (let i = token.pre_args; i < token.pre_args+token.post_args; i++) appendValuationToTR(tr, token.args[i], structure, height, from_depth, elm);
	
	if ((FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised) && token.depth > from_depth) {
		let td = document.createElement(elm)
		td.rowSpan = VARIABLES.aliases.length ** (height - token.depth)
		td.innerText = ')'
		td.classList.add("parentheses")
		tr.appendChild(td);
	}
}

INVERT_ORDER = false
function generateSimpleTable(phrase) {
	if (typeof(phrase) == "string") phrase = scan(phrase)[0];
	const propositional_variables = [...new Set(phrase.extractConstants())].sort() // extract & filter duplicates
	const max_depth = phrase.calcQuantifierHeight()
	const flat_bv = phrase.extractBoundVars()
	const bound_variables = Array(flat_bv.length/2).fill(0).map((_,i)=>[flat_bv[i*2]+1, flat_bv[i*2+1]]).sort()

	const table = document.createElement('table')
	const thead = document.createElement('thead')
	table.appendChild(thead)
	const header = document.createElement('tr')
	thead.appendChild(header)
	// list variables
	propositional_variables.forEach(p=>{
		let th = document.createElement('th')
		th.innerText = p
		header.appendChild(th)
	})
	bound_variables.forEach(([depth,symbol], i)=>{
		if (i>1 && bound_variables[i-1][0] == depth && bound_variables[i-1][1] == symbol) return;
		let th = document.createElement('th')
		th.innerText = symbol
		header.appendChild(th)
	})
	// empty td for border purposes
	let td = document.createElement('td')
	header.appendChild(td)
	// add phrase
	appendPhraseToTR(header, phrase, 'th', true)
	
	// make 2**n rows
	const tbody = document.createElement('tbody')
	table.appendChild(tbody)
	for (let i = 0; i < 2**propositional_variables.length; i++) {
		var row = document.createElement('tr')
		// generate structure
		const variable_assignments = {}
		for (let j = 0; j < propositional_variables.length; j++) {
			let pvar = propositional_variables[j]
			let value = (i >> j)&1
			if (INVERT_ORDER) value = 1-value
			variable_assignments[pvar] = value
			
			let th = document.createElement('th')
			th.innerText = CURRENT.TRUE_FALSE_SYMBOLS[value]
			th.rowSpan = VARIABLES.aliases.length ** max_depth || 1
			row.appendChild(th)
		}

		if (max_depth == 0) {
			row.insertCell() // empty td for border purposes
			appendValuationToTR(row, phrase, [variable_assignments, relation_assignments], 0,-1, 'td', true)
			tbody.appendChild(row)
			continue
		}

		for (let k = 0; k < VARIABLES.aliases.length ** max_depth; k++) { // TODO: handle empty domain case
			const quantifier_choices = []

			// extract VARIABLES.aliases.length-ary digits of k
			let n = k
			for (let j=0; j < max_depth; j++) {
				const this_choice = n % VARIABLES.aliases.length
				quantifier_choices.unshift(this_choice)
				n = (n-this_choice) / VARIABLES.aliases.length
			}

			/*  find last non-zero, and go from here.
			Essentially, we wanna generate this: 
			 1A 1B 1C 			so for 1, we have [0,0,0] -> A,B
			 1A 1B 2C			and for 2, we have [0,0,1] -> C
			 1A 3B 3C			for 3, [0,1,0] -> B,C
			 1A 3B 4C			for 4, [0,1,1] -> C
			*/
			var min_depth = max_depth-1;
			while (min_depth >= 0 && quantifier_choices[min_depth] == 0) min_depth--;

			for (let j=0; j<bound_variables.length; j++) {
				const [depth, val] = bound_variables[j];
				//console.log(bound_variables[j], VARIABLES.aliases.length ** max_depth, k, min_depth, depth, j, quantifier_choices, VARIABLES.aliases[quantifier_choices[depth]])
				// console.log(`${k}/${VARIABLES.aliases.length ** max_depth}) [${quantifier_choices.toString()}][${j}]. min_depth = ${min_depth}`)
				if (depth < min_depth) continue
				if (j > 0 && bound_variables[j-1][0] == depth && bound_variables[j-1][1] == val) continue // skip duplicates. can't filter them out as a set bc arrays are references

				const th = document.createElement('th')
				th.innerText = VARIABLES.aliases[quantifier_choices[depth]]
				th.rowSpan = VARIABLES.aliases.length ** (max_depth - depth - 1)
				row.appendChild(th)
			}
			row.insertCell()
			appendValuationToTR(row, phrase, [variable_assignments, relation_assignments, quantifier_choices], max_depth, min_depth, 'td', true)
			tbody.appendChild(row)

			row = document.createElement('tr')
		}

	}
	return table
}


const TABLE_CONTAINER = document.getElementById('table')
const FORMULA_ELM = document.getElementById('formula')
function updateFormula() {
	var newTable = generateSimpleTable(scan(FORMULA_ELM.value)[0])
	if (newTable)
		TABLE_CONTAINER.replaceChildren(newTable)
}



function texify(line, token, structure, main_operator=false) {
	
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised)
		line.push(structure ? "" : "(")
	for (let i = 0; i < token.pre_args; i++) texify(line, token.args[i], structure);
	
	var symb = ""
	if (main_operator) symb += "\\textcolor{red}{"
	if (structure) {
		if (token.type == CONSTANTS) symb += "\\textcolor{grey}{"
		symb += CURRENT.TRUE_FALSE_SYMBOLS[token.valuate(structure)*1]
		if (token.type == CONSTANTS) symb += "}"
	} else {
		symb += token.symbol
	}
	if (main_operator) symb += "}"
	
	line.push(symb)
	
	for (let i = token.pre_args; i < token.pre_args+token.post_args; i++) texify(line, token.args[i], structure);
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised)
		line.push(structure ? "" : ")")
}

function generateLaTeX() {
	// TODO: update this for quantifiers
	const old_symbols = CURRENT.CONNECTIVES.slice(0)
	CURRENT.CONNECTIVES = ['\\lnot', '\\land', '\\lor', '\\lxor', '\\rightarrow', '\\leftrightarrow']

	const phrase = scan(FORMULA_ELM.value)[0]
	  
	const propositional_variables = [...new Set(phrase.extractConstants())].sort() // extract & filter duplicates
	var out = ""
	// list variables
	var line = []
	// add phrase
	texify(line, phrase, false, true)
	
	const tab_count = line.length
	
	out += '$' + propositional_variables.concat(line) .join(' & ') + "\\\\\ \n\\hline\n"
	
	// make 2**n rows
	for (let i = 0; i < 2**propositional_variables.length; i++) {
		let line = []
		// generate structure
		const variable_assignments = {}
		for (let j = 0; j < propositional_variables.length; j++) {
			let pvar = propositional_variables[j]
			let value = (i >> j)&1
			if (INVERT_ORDER) value = 1-value
			variable_assignments[pvar] = value
			
			line.push(CURRENT.TRUE_FALSE_SYMBOLS[value])
		}
		
		texify(line, phrase, [variable_assignments, {}], true)
		
		out += '$' + line.join('$ & $') + "$\\\\\n\t"
	}
	
	alert(
	`\\begin{tabular}{${"c".repeat(propositional_variables.length)}|${"c".repeat(tab_count)}}\n`+
		out+
	"\\end{tabular}"
	)
	
	
	CURRENT.CONNECTIVES = old_symbols
}


// make the unary predicate table interactable
var relation_assignments = []
const UNARY_PREDICATE_TABLE = document.getElementById('unary-pred')
var unary_pred_count = 0
UNARY_PREDICATE_TABLE.querySelector('input').indeterminate = true
UNARY_PREDICATE_TABLE.addEventListener('input', ({target, data})=>{
	if (target.type == "checkbox") {
		const tr = target.parentElement.parentElement;
		const num_columns = tr.childElementCount - 2; // -header -spacingcolumn
		var num_rows = tr.parentElement.childElementCount;
		
		const [_, row, col] = target.id.split('-');

		if (row == num_rows) {
			addUptRow(tr.parentElement, num_rows++, num_columns)
			add_bpt_rowcol()
		}
		if (col == num_columns)
			addUptCol(tr.parentElement, num_rows, num_columns)

		// update object
		relation_assignments[target.parentElement.cellIndex-2][tr.rowIndex-1] = +target.checked

	} else {
		if (target.innerText.includes('\n')) // only trim if will make a difference, because it also resets the cursor
			target.innerText = target.innerText.replaceAll('\n', '') // BUG: space at end is c

		const tbody = UNARY_PREDICATE_TABLE.tBodies[0]
		const num_rows = tbody.rows.length
		const num_columns = UNARY_PREDICATE_TABLE.tHead.rows[0].cells.length - 3 // -header -spacingcolumn -button

		if (target.cellIndex == 0) { // left headers
			if (target.parentElement.nextElementSibling == null) {
				addUptRow(tbody, num_rows, num_columns)
				add_bpt_rowcol()
			}
			set_var_name(target.parentElement.rowIndex-1, target.innerText.trim())
		} else { // top headers
			if (target.cellIndex-1 == num_columns)
				addUptCol(tbody, num_rows, num_columns)
			RELATIONS.aliases[target.cellIndex-2] = target.innerText.trim()
		}
	}
	updateFormula()
})
function addUptRow(tbody, num_rows, num_columns) {
	const newRow = tbody.insertRow()
	const head = document.createElement('th')
	head.contentEditable = true;
	newRow.append(head)
	newRow.insertCell()
	for (let i=0; i<num_columns; i++)
		addCheckboxLabel(newRow, `u-${num_rows+1}-${i+1}`)
	for (let i=0; i<num_columns-1; i++)	
		relation_assignments[i][num_rows-1] = INDETERMINATE
	VARIABLES.aliases.push('')
}
function addUptCol(tbody, num_rows, num_columns) {
	const head = document.createElement('th')
	head.contentEditable = true
	tbody.parentElement.tHead.rows[0].lastChild.before(head)
	for (let i=0; i<num_rows; i++) {
		addCheckboxLabel(tbody.rows[i], `u-${+i+1}-${num_columns+1}`)
	}
	relation_assignments.splice(num_columns-1, 0, Array(num_rows-1).fill(INDETERMINATE))
	relation_argcounts.splice(num_columns-1, 0, [0,1])
	RELATIONS.aliases.splice(unary_pred_count++, 0, '')
}

function addCheckboxLabel(tr, id) {
	const input = document.createElement('input')
	input.type = "checkbox"
	input.indeterminate = true
	input.id = id
	const label = document.createElement('label')
	label.htmlFor = id
	tr.insertCell().append(input, label)
}

const range = n => Array(n).fill(0).map((_,i)=>i) // range(n) = [0,1,2,...,n-1], like python but not an iterator for simplicity, or APL's ι

const [upt_shrink_col, upt_shrink_row] = UNARY_PREDICATE_TABLE.querySelectorAll('button')
upt_shrink_col.addEventListener('click', ()=> {
	if (upt_shrink_col.parentElement.parentElement.cells.length <= 4) return; // preserve 1 header + 1 gap + 1 column to repopulate + 1 delete button
	RELATIONS.aliases.splice(--unary_pred_count, 1)
	// remove last column and reset previous one, cant remove 2nd to last or it'll mess up the IDs
	upt_shrink_col.parentElement.previousSibling.remove()
	upt_shrink_col.parentElement.previousSibling.innerText = ''
	;[...UNARY_PREDICATE_TABLE.tBodies[0].rows].forEach(row=> {
			row.cells[row.cells.length-1].remove()
			row.cells[row.cells.length-1].firstElementChild.indeterminate = true
		}
	)
})
upt_shrink_row.addEventListener('click', ()=>{
	const final_tr = UNARY_PREDICATE_TABLE.tBodies[0].lastElementChild
	if (final_tr.rowIndex < 2) return;
	VARIABLES.aliases.pop()

	final_tr.previousElementSibling.firstElementChild.innerText = ''
	;[...final_tr.previousElementSibling.cells].slice(2).forEach(cell=> cell.firstElementChild.indeterminate = true)
	final_tr.remove()

	for (const table of BINARY_PREDICATE_TABLES) {
		table.tBodies[0].lastElementChild.remove()
		for (const row of table.rows)
			row.lastElementChild.remove()
	}

	relation_assignments = relation_assignments.map(recursive_remove_last)
})
const recursive_remove_last = (array) => typeof(array)=="object" ? array.slice(0, -1).map(recursive_remove_last) : array

const BINARY_PREDICATE_TABLES = document.getElementsByClassName('binary-pred')
const BPT_CONTAINER = document.getElementById('binary-preds')
function add_bpt_rowcol() {
	const new_indx = VARIABLES.aliases.length-1
	for (let table_num = 0; table_num < BPT_CONTAINER.children.length; table_num++) {
		const table = BPT_CONTAINER.children[table_num];
		// add new headers
		const th = document.createElement('th')
		table.tHead.rows[0].append(th)

		const newrow = table.tBodies[0].insertRow()
		newrow.appendChild(th.cloneNode())
		newrow.insertCell()

		// add inputs
		for (let i=0; i<new_indx; i++)
			addCheckboxLabel(newrow, `b-${table_num}-${new_indx+1}-${i+1}`)
		for (let i=0; i<=new_indx; i++)
			addCheckboxLabel(table.tBodies[0].rows[i], `b-${table_num}-${i+1}-${new_indx+1}`)

		relation_assignments[table_num + unary_pred_count].forEach(row=>row.push(INDETERMINATE))
		relation_assignments[table_num + unary_pred_count][new_indx] = Array(new_indx+1).fill(INDETERMINATE)
	}
}

function add_bpt() {
	const table_num = BPT_CONTAINER.childElementCount

	const table = document.createElement('table')
	table.classList = "true-false-grid binary-pred"
	table.innerHTML = `<thead><th data-placeholder="R" contenteditable=true></th><td></td>${VARIABLES.aliases.map(v=>`<th>${v}</th>`).join('')}</thead>
	<tbody>${VARIABLES.aliases.map((v,row)=>`<tr><th>${v}</th><td></td></tr>`).join('')}</tbody>`;

	Array.prototype.forEach.call(table.tBodies[0].rows, (row, i)=> {
		for (const j in VARIABLES.aliases)
			addCheckboxLabel(row, `b-${+table_num}-${+i+1}-${+j+1}`)
	})

	BPT_CONTAINER.appendChild(table);
	table.addEventListener('input', handle_bpt_input)

	relation_assignments.splice(unary_pred_count + table_num, 0,
		Array(VARIABLES.aliases.length).fill(0).map(x=>Array(VARIABLES.aliases.length).fill(INDETERMINATE)))
	RELATIONS.aliases.splice(unary_pred_count + table_num, 0, '')
	relation_argcounts.splice(unary_pred_count + table_num, 0, [1,1])
}

function remove_bpt() {
	BPT_CONTAINER.lastElementChild.remove()
	relation_assignments.splice(unary_pred_count + BPT_CONTAINER.childElementCount, 1)
}

function handle_bpt_input({target}) {
	if (target.type == "checkbox") {
		const [_,table,row,col] = target.id.split('-')
		// for xRy, should x or y be the the column header?
		// consistency with unary would have x as column
		// but wikipedia and my lecturer use y
		relation_assignments[+table + UNARY_PREDICATE_TABLE.rows[0].cells.length-4][col-1][row-1] = +target.checked
	} else {
		if (target.innerText.includes('\n')) // only trim if will make a difference, because it also resets the cursor
			target.innerText = target.innerText.replaceAll('\n', '') // BUG: space at end is c

		console.log(Array.prototype.indexOf.call(BPT_CONTAINER.children, target.parentElement.parentElement.parentElement))
		RELATIONS.aliases[unary_pred_count + Array.prototype.indexOf.call(BPT_CONTAINER.children, target.parentElement.parentElement.parentElement)] = target.innerText
	}
}

function set_var_name(index, newName) {
	VARIABLES.aliases[index] = newName
	// called after manually updating UPT, so we don't need to modify there
	// modify BPTs
	for (const table of BINARY_PREDICATE_TABLES) {
		table.tHead.rows[0].cells[index+2].innerText = newName
		table.tBodies[0].rows[index].cells[0].innerText = newName
	}
}

/* add connective tables */
const CONNECTIVE_CONTAINER = document.getElementById('connectives')
for (const connective of TYPES.filter(x=>x.custom_display))
	CONNECTIVE_CONTAINER.appendChild(create_connective_table(connective))
function create_connective_table(connective) {
	const arg_names = 'pqrstuvwxyz'.split('')
	const total_args = connective.pre_args() + connective.post_args()

	const table = document.createElement('table')
	table.classList.add('true-false-grid')

	connective.args = [] // so we can call .valuate()
	console.log(total_args);
	table.innerHTML = `<caption>
		<h3>${connective.fullname}</h3>
		<label><input type=checkbox checked> Enable</label><br>
		<label>Inputs: <input value="${connective.aliases.join(', ').replaceAll('"', '&qt;')}"></label>
	</caption>
	${connective.quantifier ? '' : `<thead>
		${arg_names.slice(0,total_args).map(x=>`<th>${x}</th>`).join('')}
		<td></td>
		<th>
			${arg_names.slice(0,connective.pre_args()).join('')}
			<span>${CURRENT[connective.custom_display[0]][connective.custom_display[1]]}</span>
			${arg_names.slice(connective.pre_args(), total_args).join('')}
		</th>
	</thead>
	${Array(2**total_args).fill(0).map((_,i)=>i.toString(2).padStart(total_args, '0')).map(args=>`<tr>
		${Array(total_args).fill(0).map((_,i)=>`<th>
			<input disabled type=checkbox ${args[i] == "1" ? 'checked' : ''}><label></label>
		</th>`).join('')}
		<td></td>
		<td><input disabled type=checkbox ${(total_args==0 || (connective.args = args.split('').map(x=>{return {valuate: _=>+x}}))) && connective.valuate({}) ? 'checked' : ''}><label></label></td>
	</tr>`).join('')}
	`}`
	connective.args = undefined // meaningless property, only useful for this. reset to reduce confusion

	table.addEventListener('input', ({target})=>{
		if (target.type == 'checkbox') // toggle enable
			connective.disabled = !target.checked
		else // inputs
			connective.aliases = target.value.split(',').map(x=>x.trim())
		updateFormula()
	})

	table.dataset.symb_type = connective.custom_display[0]
	table.dataset.symb_indx = connective.custom_display[1]

	return table
}
function update_connective_tables() {
	for (const table of CONNECTIVE_CONTAINER.children) {
		if (table.tHead)
			table.tHead.rows[0].lastElementChild.firstElementChild.innerText = CURRENT[table.dataset.symb_type][table.dataset.symb_indx]
	}
}
// TODO: add ability to create connectives