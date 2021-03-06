import { ELEMENT, YIELDER } from '../config/types';
import runloop from '../global/runloop';
import createItem from './items/createItem';
import ReferenceResolver from './resolvers/ReferenceResolver';
import { bind, destroyed, shuffled, toEscapedString, toString, unbind, unrender, update } from '../shared/methodCallers';
import processItems from './helpers/processItems';
import parseJSON from '../utils/parseJSON';
import { createDocumentFragment } from '../utils/dom';
import { findMap } from '../utils/array';

function unrenderAndDestroy ( item ) {
	item.unrender( true );
}

export default class Fragment {
	constructor ( options ) {
		this.owner = options.owner; // The item that owns this fragment - an element, section, partial, or attribute

		this.isRoot = !options.owner.parentFragment;
		this.parent = this.isRoot ? null : this.owner.parentFragment;
		this.ractive = options.ractive || ( this.isRoot ? options.owner : this.parent.ractive );

		this.componentParent = ( this.isRoot && this.ractive.component ) ? this.ractive.component.parentFragment : null;

		this.context = null;
		this.rendered = false;

		// encapsulated styles should be inherited until they get applied by an element
		this.cssIds = 'cssIds' in options ? options.cssIds : ( this.parent ? this.parent.cssIds : null );

		this.resolvers = [];

		this.dirty = false;
		this.dirtyValue = true; // used for attribute values

		this.template = options.template || [];
		this.createItems();
	}

	bind ( context ) {
		this.context = context;
		this.items.forEach( bind );
		this.bound = true;

		// in rare cases, a forced resolution (or similar) will cause the
		// fragment to be dirty before it's even finished binding. In those
		// cases we update immediately
		if ( this.dirty ) this.update();

		return this;
	}

	bubble () {
		this.dirtyValue = true;

		if ( !this.dirty ) {
			this.dirty = true;

			if ( this.isRoot ) { // TODO encapsulate 'is component root, but not overall root' check?
				if ( this.ractive.component ) {
					this.ractive.component.bubble();
				} else if ( this.bound ) {
					runloop.addFragment( this );
				}
			} else {
				this.owner.bubble();
			}
		}
	}

	createItems () {
		// this is a hot code path
		const max = this.template.length;
		this.items = [];
		for ( let i = 0; i < max; i++ ) {
			this.items[i] = createItem({ parentFragment: this, template: this.template[i], index: i });
		}
	}

	destroyed () {
		this.items.forEach( destroyed );
	}

	detach () {
		const docFrag = createDocumentFragment();
		this.items.forEach( item => docFrag.appendChild( item.detach() ) );
		return docFrag;
	}

	find ( selector, options ) {
		return findMap( this.items, i => i.find( selector, options ) );
	}

	findAll ( selector, query ) {
		if ( this.items ) {
			this.items.forEach( i => i.findAll && i.findAll( selector, query ) );
		}
	}

	findComponent ( name, options ) {
		return findMap( this.items, i => i.findComponent( name, options ) );
	}

	findAllComponents ( name, query ) {
		if ( this.items ) {
			this.items.forEach( i => i.findAllComponents && i.findAllComponents( name, query ) );
		}
	}

	findContext () {
		let fragment = this;
		while ( fragment && !fragment.context ) fragment = fragment.parent;
		if ( !fragment ) return this.ractive.viewmodel;
		else return fragment.context;
	}

	findNextNode ( item ) {
		// search for the next node going forward
		if ( item ) {
			for ( let i = item.index + 1; i < this.items.length; i++ ) {
				if ( !this.items[ i ] ) continue;

				const node = this.items[ i ].firstNode( true );
				if ( node ) return node;
			}
		}

		// if this is the root fragment, and there are no more items,
		// it means we're at the end...
		if ( this.isRoot ) {
			if ( this.ractive.component ) {
				return this.ractive.component.parentFragment.findNextNode( this.ractive.component );
			}

			// TODO possible edge case with other content
			// appended to this.ractive.el?
			return null;
		}

		if ( this.parent ) return this.owner.findNextNode( this ); // the argument is in case the parent is a RepeatedFragment
	}

	findParentNode () {
		let fragment = this;

		do {
			if ( fragment.owner.type === ELEMENT ) {
				return fragment.owner.node;
			}

			if ( fragment.isRoot && !fragment.ractive.component ) { // TODO encapsulate check
				return fragment.ractive.el;
			}

			if ( fragment.owner.type === YIELDER ) {
				fragment = fragment.owner.containerFragment;
			} else {
				fragment = fragment.componentParent || fragment.parent; // TODO ugh
			}
		} while ( fragment );

		throw new Error( 'Could not find parent node' ); // TODO link to issue tracker
	}

	findRepeatingFragment () {
		let fragment = this;
		// TODO better check than fragment.parent.iterations
		while ( ( fragment.parent || fragment.componentParent ) && !fragment.isIteration ) {
			fragment = fragment.parent || fragment.componentParent;
		}

		return fragment;
	}

	firstNode ( skipParent ) {
		const node = findMap( this.items, i => i.firstNode( true ) );
		if ( node ) return node;
		if ( skipParent ) return null;

		return this.parent.findNextNode( this.owner );
	}

	rebinding ( next ) {
		this.context = next;
	}

	render ( target, occupants ) {
		if ( this.rendered ) throw new Error( 'Fragment is already rendered!' );
		this.rendered = true;

		this.items.forEach( item => item.render( target, occupants ) );
	}

	resetTemplate ( template ) {
		const wasBound = this.bound;
		const wasRendered = this.rendered;

		// TODO ensure transitions are disabled globally during reset

		if ( wasBound ) {
			if ( wasRendered ) this.unrender( true );
			this.unbind();
		}

		this.template = template;
		this.createItems();

		if ( wasBound ) {
			this.bind( this.context );

			if ( wasRendered ) {
				const parentNode = this.findParentNode();
				const anchor = this.findNextNode();

				if ( anchor ) {
					const docFrag = createDocumentFragment();
					this.render( docFrag );
					parentNode.insertBefore( docFrag, anchor );
				} else {
					this.render( parentNode );
				}
			}
		}
	}

	resolve ( template, callback ) {
		if ( !this.context && this.parent.resolve ) {
			return this.parent.resolve( template, callback );
		}

		const resolver = new ReferenceResolver( this, template, callback );
		this.resolvers.push( resolver );

		return resolver; // so we can e.g. force resolution
	}

	shuffled () {
		this.items.forEach( shuffled );
	}

	toString ( escape ) {
		return this.items.map( escape ? toEscapedString : toString ).join( '' );
	}

	unbind () {
		this.items.forEach( unbind );
		this.bound = false;

		return this;
	}

	unrender ( shouldDestroy ) {
		this.items.forEach( shouldDestroy ? unrenderAndDestroy : unrender );
		this.rendered = false;
	}

	update () {
		if ( this.dirty ) {
			if ( !this.updating ) {
				this.dirty = false;
				this.updating = true;
				this.items.forEach( update );
				this.updating = false;
			} else if ( this.isRoot ) {
				runloop.addFragmentToRoot( this );
			}
		}
	}

	valueOf () {
		if ( this.items.length === 1 ) {
			return this.items[0].valueOf();
		}

		if ( this.dirtyValue ) {
			const values = {};
			const source = processItems( this.items, values, this.ractive._guid );
			const parsed = parseJSON( source, values );

			this.value = parsed ?
				parsed.value :
				this.toString();

			this.dirtyValue = false;
		}

		return this.value;
	}
}
