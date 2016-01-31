import { test } from 'qunit';

test( 'toCSS with a single component', t => {

	let Component = Ractive.extend({
		template: `
			<div class="child-component">
				<p>This is also red</p>
				<p class="green">This should be green</p>
			</div>
		`,
		css: `
			.green {
				color: green
			}
		`
	});

	let app = new Component({
		el: fixture
	});

	let css = app.toCSS();

	// Look for the selector
	t.ok( !!~css.indexOf( '.green[data-ractive-css~="{1}"], [data-ractive-css~="{1}"] .green' ) );

	app.teardown();

});

test( 'toCSS with a nested component', t => {

	let ChildComponent = Ractive.extend({
		template: `
			<div class="child-component">
				<p>This is also red</p>
				<p class="green">This should be green</p>
			</div>
		`,
		css: `
			.green {
				color: green
			}
		`
	});

	let ParentComponent = Ractive.extend({
		template: `
			<div class="parent-component">
				<p>This should be red</p>
				<p class="blue">This should be blue</p>
				<ChildComponent />
			</div>
		`,
		css: `
			.parent-component{
				color: red;
			}
			.blue{
				color: blue;
			}
		`,
		components: {
			ChildComponent
		}
	});

	let app = new ParentComponent({
		el: fixture
	});

	let css = app.toCSS();

	// Look for the selectors
	t.ok( !!~css.indexOf( '.green[data-ractive-css~="{1}"], [data-ractive-css~="{1}"] .green' ) );
	t.ok( !!~css.indexOf( '.parent-component[data-ractive-css~="{2}"], [data-ractive-css~="{2}"] .parent-component' ) );
	t.ok( !!~css.indexOf( '.blue[data-ractive-css~="{2}"], [data-ractive-css~="{2}"] .blue' ) );

	app.teardown();

});
