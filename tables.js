const CURRENT = {}
const TEMPLATES = {}
function update_current(type, template_num) {
	if (isNaN(template_num)) {
		// custom
		TEMPLATES[type].values[-1] = [...document.querySelectorAll(`input[name="${type}"][value=custom]~fieldset input`)].map(input => input.value);
		template_num = -1
	}
	TEMPLATES[type].selected = template_num;
	CURRENT[type] = TEMPLATES[type].values[template_num];
}
function add_template(type, template_name, values) {
	TEMPLATES[type].names.push(template_name)
	TEMPLATES[type].values.push(values)
}
TEMPLATES["CONNECTIVES"] = {name: "Connective Symbols", fields: 6, names: [], values: []}
add_template("CONNECTIVES", "Modern Logic", ['¬', '∧', '∨', '⊻', '→', '↔'])
add_template("CONNECTIVES", "Traditional Logic", ['~', '∧', '∨', '⊻', '⊃', '≡'])
add_template("CONNECTIVES", "Programming", ['!', '&', '|', '^', '→', '=='])
add_template("CONNECTIVES", "Algebra", ['¬', '•', '+', '⊕', '→', '≡'])
update_current("CONNECTIVES", 0)

TEMPLATES["TRUE_FALSE_SYMBOLS"] = {name: "Truth Symbols", hide_fields:true, fields: 2, names: [], values: []}
add_template("TRUE_FALSE_SYMBOLS", "T/F", ['F', 'T'])
add_template("TRUE_FALSE_SYMBOLS", "1/0", ['0', '1'])
add_template("TRUE_FALSE_SYMBOLS", "⊤/⊥", ['⊥', '⊤'])
update_current("TRUE_FALSE_SYMBOLS", 0)

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
				let match = TYPES[i].scan(string)
				if (match && match[0].length > longest_match) {
					type = TYPES[i]
					longest_match = match[0].length
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
		this.pre_args = type.pre_args(string) || 0
		this.post_args = type.post_args(string) || 0
		this.valuate = type.valuate
		
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
	}
	
	add(token) {
		if (this.args_needed < 1) throw "too many arguments supplied"
		this.args_needed --
		this.args.push(token)
		if (this.args_needed == 0) this.complete = true
	}
	
	extractConstants() {
		if (this.type == CONSTANTS) return [this.symbol]
		return this.args.flatMap(x=>x.extractConstants())
	}
	extractRelations() {
		if (this.type == RELATIONS) return [this.symbol]
		return this.args.flatMap(x=>x.extractRelations())
	}
	
	toString() {
		if (this.pre_args === 0 && this.post_args === 0) return this.symbol
		return this.symbol + "{" + this.args.map(x=>x.toString()).concat(Array(this.args_needed).fill('_')).join(',') + "}"
	}
}

const TYPES = []
class TokenType {
	constructor(name, symbols, {post_args=()=>0, pre_args=()=>0, valuate=function(){throw "No valuation defined for "+this.name}, display=false} = {}) {
		this.name = name
		this.scan = typeof(symbols)=="string" ? x=>symbols.includes(x[0])?[x[0]]:false : x=>symbols.exec(x)
		this.pre_args = typeof(pre_args)=="number"? ()=>pre_args : pre_args
		this.post_args = typeof(post_args)=="number"? ()=>post_args : post_args
		this.custom_display = display
		this.valuate = valuate
		TYPES.push(this)
	}
}

new TokenType("negation", /^(?:[!~¬]|\\lnot|NOT)/, {post_args:1, valuate:function(_){return !this.args[0].valuate(_)}, display:['CONNECTIVES',0]})
new TokenType("disjunction", /^(?:[v∨|+]|\\lor|OR)/, {pre_args:1, post_args:1, valuate:function(_){return this.args.reduce((t,c)=>t||c.valuate(_),false)}, display:['CONNECTIVES',2]})
new TokenType("conjunction", /^(?:[&∧^•.]|\\land|AND)/, {pre_args:1, post_args:1, valuate:function(_){return this.args.reduce((t,c)=>t&&c.valuate(_),true)}, display:['CONNECTIVES',1]})
new TokenType("implication", /^(?:[>→⊃]|\\implies|->|IMPLIES)/, {pre_args:1, post_args:1, valuate:function(_){return !this.args[0].valuate(_) || this.args[1].valuate(_) }, display:['CONNECTIVES',4]})
new TokenType("bi-implication", /^(?:<>|<->|=|==|\\leftrightarrow|IFF)/, {pre_args:1, post_args:1, valuate:function(_){return this.args[0].valuate(_) == this.args[1].valuate(_) }, display:['CONNECTIVES',5]})
new TokenType("postfix operator", "'", {pre_args:1, valuate:function(_){return this.args[0].valuate(_)}})
new TokenType("falsum", /^(?:[#F⊥0]|\\bot)/, {valuate: ()=>false, display:['TRUE_FALSE_SYMBOLS',0]})
new TokenType("verum", /^(?:[T1⊥]|\\top)/, {valuate: ()=>true, display:['TRUE_FALSE_SYMBOLS',1]})
const CONSTANTS = new TokenType("constant", "", {valuate: function([const_map]){return const_map[this.symbol]}})
new TokenType("variable", "xyz")
const RELATIONS = new TokenType("relation", "FGRS", {post_args:1, pre_args: f=>"RS".includes(f)?1:0, valuate: function([_,rel_map]){return this.args.reduce((t,c)=>t[c.symbol], rel_map[this.symbol])}})
new TokenType("(", "(")

function scan(txt) {
	var stack = []
	var i = 0, lastRecognised = 0
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
				stack.push(new Token(txt.slice(lastRecognised, i), stack, "constant"))
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

function appendValuationToTR(tr, token, structure, elm='td', main_operator=false) {
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised)
		tr.appendChild(document.createElement(elm));
	
	for (let i = 0; i < token.pre_args; i++) appendValuationToTR(tr, token.args[i], structure, elm);
	let td = document.createElement(elm)
	tr.appendChild(td)
	if (main_operator) td.classList.add('mainOperator');
	if (token.type == CONSTANTS) td.classList.add('constant');
	td.innerText = CURRENT.TRUE_FALSE_SYMBOLS[token.valuate(structure)*1]
	
	for (let i = token.pre_args; i < token.pre_args+token.post_args; i++) appendValuationToTR(tr, token.args[i], structure, elm);
	
	if (FORCE_PARENTHESES ? token.type !== CONSTANTS : token.parenthesised)
		tr.appendChild(document.createElement(elm));
}

INVERT_ORDER = false
function generateSimpleTable(phrase) {
	if (typeof(phrase) == "string") phrase = scan(phrase)[0];
	const propositional_variables = [...new Set(phrase.extractConstants())].sort() // extract & filter duplicates
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
	// empty td for border purposes
	let td = document.createElement('td')
	header.appendChild(td)
	// add phrase
	appendPhraseToTR(header, phrase, 'th', true)
	
	// make 2**n rows
	const tbody = document.createElement('tbody')
	table.appendChild(tbody)
	for (let i = 0; i < 2**propositional_variables.length; i++) {
		const row = document.createElement('tr')
		tbody.appendChild(row)
		// generate structure
		const variable_assignments = {}
		for (let j = 0; j < propositional_variables.length; j++) {
			let pvar = propositional_variables[j]
			let value = (i >> j)&1
			if (INVERT_ORDER) value = 1-value
			variable_assignments[pvar] = value
			
			let th = document.createElement('th')
			th.innerText = CURRENT.TRUE_FALSE_SYMBOLS[value]
			row.appendChild(th)
		}
		// empty td for border purposes
		let td = document.createElement('td')
		row.appendChild(td)
		
		appendValuationToTR(row, phrase, [variable_assignments, {}], 'td', true)
	}
	return table
}


const TABLE_CONTAINER = document.getElementById('table')
const FORMULA_ELM = document.getElementById('formula')
function updateFormula(formula) {
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
const unary_predicate_table = document.getElementById('unary-pred')
unary_predicate_table.querySelector('input').indeterminate = true
unary_predicate_table.addEventListener('input', ({target})=>{
	if (target.type == "checkbox") {
		const tr = target.parentElement.parentElement;
		const num_columns = tr.childElementCount - 2; // -header -spacingcolumn
		const num_rows = tr.parentElement.childElementCount;
		
		const [_, row, col] = target.id.split('-');

		if (row == num_rows) {
			// add row
			const newRow = tr.parentElement.insertRow()
			const head = document.createElement('th')
			head.contentEditable = true;
			newRow.append(head)
			newRow.insertCell()
			for (let i=0; i<num_columns; i++) {
				const td = newRow.insertCell()
				const input = document.createElement('input')
				input.type = "checkbox"
				input.indeterminate = true
				input.id = `u-${num_rows+1}-${i+1}`
				const label = document.createElement('label')
				label.htmlFor = input.id
				td.append(input, label)
			}
		}
		if (col == num_columns) {
			// add column
			const head = document.createElement('th')
			head.contentEditable = true
			tr.parentElement.parentElement.tHead.rows[0].lastChild.before(head)
			for (const [i, row] of Object.entries(tr.parentElement.children)) {
				const td = row.insertCell()
				const input = document.createElement('input')
				input.type = "checkbox"
				input.indeterminate = true
				input.id = `u-${+i+1}-${num_columns+1}`
				const label = document.createElement('label')
				label.htmlFor = input.id
				td.append(input, label)
			}

		}
	}

})
const [upt_shrink_col, upt_shrink_row] = unary_predicate_table.querySelectorAll('button')
upt_shrink_col.addEventListener('click', ()=> {
	if (upt_shrink_col.parentElement.parentElement.cells.length <= 4) return; // preserve 1 header + 1 gap + 1 column to repopulate + 1 delete button
	// remove last column and reset previous one, cant remove 2nd to last or it'll mess up the IDs
	upt_shrink_col.parentElement.previousSibling.remove()
	upt_shrink_col.parentElement.previousSibling.innerText = ''
	;[...unary_predicate_table.tBodies[0].rows].forEach(row=> {
			row.cells[row.cells.length-1].remove()
			row.cells[row.cells.length-1].firstElementChild.indeterminate = true
		}
	)
})
upt_shrink_row.addEventListener('click', ()=>{
	const final_tr = unary_predicate_table.tBodies[0].lastElementChild
	if (final_tr.rowIndex < 2) return;

	final_tr.previousElementSibling.firstElementChild.innerText = ''
	;[...final_tr.previousElementSibling.cells].slice(2).forEach(cell=> cell.firstElementChild.indeterminate = true)
	final_tr.remove()
})
