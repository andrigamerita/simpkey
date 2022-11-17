import { Context, DefaultState } from 'koa';
import Router from 'koa-router';
import { signIn, api, i, notesShow, usersShowByName } from './misskey';
import { Note } from './models/Note';
import { die } from './die';

export const router = new Router<DefaultState, Context>();

const staticRouting = [
	[ 'about', 'About Simpkey' ],
	[ 'terms', 'Terms of Use' ],
	[ 'privacy-policy', 'Privacy Policy' ],
	[ 'settings', 'Settings' ],
	[ 'help', 'Help' ],
];

for (const [ name, title ] of staticRouting) {
	router.get('/' + name, async ctx => {
		await ctx.render(name, { title });
	});
}

async function timeline(ctx: Context, host: string, endpoint: string, timelineName: string, token: string) {
	const user = await i(host, token);
	const notes = await api<Note[]>(host, endpoint, { i: token });

	const myself = await i(host, token);
	await ctx.render('timeline', {
		title: timelineName + ' - Simpkey',
		user, 
		notes, 
		timelineName, 
		canRenote: (note: Note) => note.userId === myself.id || note.visibility === 'public' || note.visibility === 'home',
		canReact: (note: Note) => note.userId !== myself.id, 
	});
}

router.get('/', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		console.log('no session so show top page');
		await ctx.render('index', { 
			title: 'Simpkey'
		});
		return;
	}

	await timeline(ctx, host, 'notes/timeline', 'Home Timeline', token);
});

router.get('/ltl', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}
	const meta = await api<any>(host, 'meta', { i: token });
	if (meta.disableLocalTimeline) {
		await die(ctx, 'Local timeline has been disabled');
	} else {
		await timeline(ctx, host, 'notes/local-timeline', 'Local Timeline', token);
	}
});

router.get('/stl', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}
	const meta = await api<any>(host, 'meta', { i: token });
	if (meta.disableLocalTimeline) {
		await die(ctx, 'Social timeline has been disabled');
	} else {
		await timeline(ctx, host, 'notes/hybrid-timeline', 'Social Timeline', token);
	}
});

router.get('/gtl', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	const meta = await api<any>(host, 'meta', { i: token });
	if (meta.disableGlobalTimeline) {
		await die(ctx, 'Global timeline has been disabled');
	} else {
		await timeline(ctx, host, 'notes/global-timeline', 'Global Timeline', token);
	}
});

router.get('/notifications', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	const myself = await i(host, token);
	const notifications = await api<any>(host, 'i/notifications', { i: token });
	await ctx.render('notifications', { 
		notifications, 
		canRenote: (note: Note) => note.userId === myself.id || note.visibility === 'public' || note.visibility === 'home',
		canReact: (note: Note) => note.userId !== myself.id, 
	});

});

router.get('/renote/:noteId', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	try {
		const myself = await i(host, token);
		const note = await notesShow(host, ctx.params.noteId);
		await ctx.render('renote', {
			note, 
			canRenote: note.userId === myself.id || note.visibility === 'public' || note.visibility === 'home' 
		});
	} catch(e) {
		await die(ctx, e.message);
	}
});

router.get('/reply/:noteId', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	try {
		const note = await notesShow(host, ctx.params.noteId);
		await ctx.render('reply', { note });
	} catch(e) {
		await die(ctx, e.message);
	}
});

router.get('/react/:noteId', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	try {
		const note = await notesShow(host, ctx.params.noteId);
		const myself = await i(host, token);
		await ctx.render('react', { 
			note, 
			reactions: myself.clientData?.reactions, 
			canReact: note.userId !== myself.id && !note.myReaction
		});
	} catch(e) {
		await die(ctx, e.message);
	}
});

router.get('/@:acct', async ctx => {
	const token = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!token || !host) {
		await die(ctx, 'Please login');
		return;
	}

	const acct = ctx.params.acct.split('@');
	const username = acct[0];
	const remoteHost = acct[1];
	const myself = await i(host, token);

	const user = await usersShowByName(host, username, remoteHost);
	const notes = await api<Note[]>(host, 'users/notes', { i: token, userId: user.id });
	await ctx.render('user', { 
		user, 
		notes, 
		canRenote: (note: Note) => note.userId === myself.id || note.visibility === 'public' || note.visibility === 'home',
		canReact: (note: Note) => note.userId !== myself.id, 
	});
});

router.post('/', async ctx => {
	const { 
		host,
		username,
		password,
		token
	} = ctx.request.body;
	if (!host || !username || !password) {
		await die(ctx, 'Some parameters are missing. Please retry.');
		return;
	}
	try {
		const { id, i } = await signIn(host, username, password, token);
		ctx.cookies.set('id', id);
		ctx.cookies.set('host', host);
		ctx.cookies.set('i', i);
		console.log('login as ' + username);
		ctx.redirect('/');
	} catch (err) {
		await die(ctx, err.message);
		console.error(err);
	}
});

router.post('/action/:action', async ctx => {
	const i = ctx.cookies.get('i');
	const host = ctx.cookies.get('host');
	if (!i || !host) {
		await die(ctx, 'Please login');
		return;
	}

	const action = ctx.params.action as string;
	try {
		switch (action) {
		case 'create-note': {
			const { text, renoteId, replyId, useCw, cw, visibility } = ctx.request.body;
			const opts = { i } as Record<string, string>;
			if (text) opts.text = text;
			if (renoteId) opts.renoteId = renoteId;
			if (replyId) opts.replyId = replyId;
			if (useCw) opts.cw = cw || '';
			if (visibility) opts.visibility = visibility;
			await api(host, 'notes/create', opts);
			break;
		}
		case 'react': {
			const { noteId, reaction, customReaction } = ctx.request.body;
			if (!noteId) throw new Error('noteId required');
			if (!reaction) throw new Error('No emoji was specified');
			await api(host, 'notes/reactions/create', { i, noteId, reaction: reaction === 'custom' ? customReaction : reaction });
			break;
		}
		case 'unreact': {
			const { noteId } = ctx.request.body;
			if (!noteId) throw new Error('noteId required');
			await api(host, 'notes/reactions/delete', { i, noteId });
			break;
		}
		}
	} catch (e) {
		await die(ctx, e.message);
		return;
	}
	ctx.redirect('/');
});

router.post('/logout', ctx => {
	ctx.cookies.set('id');
	ctx.cookies.set('host');
	ctx.cookies.set('i');
	ctx.redirect('/');
});

// Return 404 for other pages
router.all('(.*)', async ctx => {
	ctx.status = 404;
	await die(ctx, 'Resource not found');
});