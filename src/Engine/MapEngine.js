/**
 * Engine/MapEngine.js
 *
 * Map Engine
 * Manage Map server
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

define(function( require )
{
	'use strict';


	/**
	 * Load dependencies
	 */
	var jQuery           = require('Utils/jquery');
	var DB               = require('DB/DBManager');
	var Configs          = require('Core/Configs');
	var SoundManager     = require('Audio/SoundManager');
	var BGM              = require('Audio/BGM');
	var Events           = require('Core/Events');
	var Session          = require('Engine/SessionStorage');
	var Network          = require('Network/NetworkManager');
	var PACKETVER        = require('Network/PacketVerManager');
	var PACKET           = require('Network/PacketStructure');
	var Renderer         = require('Renderer/Renderer');
	var Camera           = require('Renderer/Camera');
	var MapRenderer      = require('Renderer/MapRenderer');
	var EntityManager    = require('Renderer/EntityManager');
	var Entity           = require('Renderer/Entity/Entity');
	var Altitude         = require('Renderer/Map/Altitude');
	var MapControl       = require('Controls/MapControl');
	var Mouse            = require('Controls/MouseEventHandler');
	var KEYS             = require('Controls/KeyEventHandler');
	var UIManager        = require('UI/UIManager');
	var EffectManager     = require('Renderer/EffectManager');
	var Background       = require('UI/Background');
	var Escape           = require('UI/Components/Escape/Escape');
	var ChatBox          = require('UI/Components/ChatBox/ChatBox');
	var ChatBoxSettings  = require('UI/Components/ChatBoxSettings/ChatBoxSettings');

	if(Configs.get('enableCheckAttendance') && PACKETVER.value >= 20180307) {
		var CheckAttendance  = require('UI/Components/CheckAttendance/CheckAttendance');
	}

	var WinStats         = require('UI/Components/WinStats/WinStats');
	var Inventory        = require('UI/Components/Inventory/Inventory');
	var CartItems        = require('UI/Components/CartItems/CartItems');
	var Vending          = require('UI/Components/Vending/Vending');
	var ChangeCart       = require('UI/Components/ChangeCart/ChangeCart');
	var ShortCut         = require('UI/Components/ShortCut/ShortCut');
	var Equipment        = require('UI/Components/Equipment/Equipment');
	var ShortCuts        = require('UI/Components/ShortCuts/ShortCuts');
	var StatusIcons      = require('UI/Components/StatusIcons/StatusIcons');
	var ChatRoomCreate   = require('UI/Components/ChatRoomCreate/ChatRoomCreate');
	var Emoticons        = require('UI/Components/Emoticons/Emoticons');
	var FPS              = require('UI/Components/FPS/FPS');
	var PartyFriends     = require('UI/Components/PartyFriends/PartyFriends');
	var Guild            = require('UI/Components/Guild/Guild');
	var WorldMap         = require('UI/Components/WorldMap/WorldMap');
	var SkillListMER     = require('UI/Components/SkillListMER/SkillListMER');
	var MobileUI         = require('UI/Components/MobileUI/MobileUI');
	var CashShop         = require('UI/Components/CashShop/CashShop');
	var Bank             = require('UI/Components/Bank/Bank');
	var Rodex            = require('UI/Components/Rodex/Rodex');
	var RodexIcon        = require('UI/Components/Rodex/RodexIcon');
	if(Configs.get('enableMapName')){
		var MapName          = require('UI/Components/MapName/MapName');
	}
	var PluginManager    = require('Plugins/PluginManager');

	var UIVersionManager      = require('UI/UIVersionManager');
	// Version Dependent UIs
	var BasicInfo = require('UI/Components/BasicInfo/BasicInfo');
	var MiniMap   = require('UI/Components/MiniMap/MiniMap');
	var SkillList = require('UI/Components/SkillList/SkillList');
	var Quest     = require('UI/Components/Quest/Quest');

	/**
	 * @var {string mapname}
	 */
	var _mapName = '';


	/**
	 * @var {boolean} is initialized
	 */
	var _isInitialised = false;


	/**
	 * @namespace MapEngine
	 */
	var MapEngine = {};

	var snCounter = 0;
	var chatLines = 0;


	/**
	 * @var {boolean} do we need to update UI versions?
	 */
	MapEngine.needsUIVerUpdate = false;


	/**
	 * Connect to Map Server
	 *
	 * @param {number} IP
	 * @param {number} port
	 * @param {string} mapName
	 */
	MapEngine.init = function init( ip, port, mapName )
	{
		_mapName = mapName;

		// Connect to char server
		Network.connect( Network.utils.longToIP( ip ), port, function onconnect( success ) {

			// Force reloading map
			MapRenderer.currentMap = '';

			// Fail to connect...
			if (!success) {
				UIManager.showErrorBox( DB.getMessage(1) );
				return;
			}

			// Success, try to login.
			var pkt;
			if(PACKETVER.value >= 20180307) {
				pkt        = new PACKET.CZ.ENTER2();
			} else {
				pkt        = new PACKET.CZ.ENTER();
			}
			pkt.AID        = Session.AID;
			pkt.GID        = Session.GID;
			pkt.AuthCode   = Session.AuthCode;
			pkt.clientTime = Date.now();
			pkt.Sex        = Session.Sex;
			Network.sendPacket(pkt);

			// Server send back AID
			Network.read(function(fp){
				// if PACKETVER < 20070521, client send GID...
				if (fp.length === 4) {
					Session.Character.GID = fp.readLong();
				}
			});

			var hbt = new PACKET.CZ.HBT();
			var is_sec_hbt = Configs.get('sec_HBT', null);

			// Ping
			var ping;
			if(PACKETVER.value >= 20180307) {
				ping = new PACKET.CZ.REQUEST_TIME2();
			} else {
				ping = new PACKET.CZ.REQUEST_TIME();
			}
			var startTick = Date.now();
			Network.setPing(function(){
			if(is_sec_hbt)Network.sendPacket(hbt);
				ping.clientTime = Date.now() - startTick;
				Network.sendPacket(ping);
			});

			Session.Playing = true;
		}, true);


		// Select UI version when needed
		if(MapEngine.needsUIVerUpdate || !_isInitialised){
			BasicInfo.selectUIVersion();
			MiniMap.selectUIVersion();
			SkillList.selectUIVersion();
			Quest.selectUIVersion();
			Equipment.selectUIVersion();
		}

		// Do not hook multiple time
		if (!_isInitialised) {
			_isInitialised = true;

			MapControl.init();
			MapControl.onRequestWalk     = onRequestWalk;
			MapControl.onRequestStopWalk = onRequestStopWalk;
			MapControl.onRequestDropItem = onDropItem;

			// Hook packets
			Network.hookPacket( PACKET.ZC.AID,                 onReceiveAccountID );
			Network.hookPacket( PACKET.ZC.ACCEPT_ENTER,        onConnectionAccepted );
			Network.hookPacket( PACKET.ZC.ACCEPT_ENTER2,       onConnectionAccepted );
			Network.hookPacket( PACKET.ZC.ACCEPT_ENTER3,       onConnectionAccepted );
			Network.hookPacket( PACKET.ZC.NPCACK_MAPMOVE,      onMapChange );
			Network.hookPacket( PACKET.ZC.NPCACK_SERVERMOVE,   onServerChange );
			Network.hookPacket( PACKET.ZC.ACCEPT_QUIT,         onExitSuccess );
			Network.hookPacket( PACKET.ZC.REFUSE_QUIT,         onExitFail );
			Network.hookPacket( PACKET.ZC.RESTART_ACK,         onRestartAnswer );
			Network.hookPacket( PACKET.ZC.ACK_REQ_DISCONNECT,  onDisconnectAnswer );
			Network.hookPacket( PACKET.ZC.NOTIFY_TIME,         onPong );

			// Extend controller
			require('./MapEngine/Main').call();
			require('./MapEngine/NPC').call();
			require('./MapEngine/Entity').call();
			require('./MapEngine/Item').call();
			require('./MapEngine/Mail').call();
			require('./MapEngine/PrivateMessage').call();
			require('./MapEngine/Storage').call();
			require('./MapEngine/Group').init();
			require('./MapEngine/Guild').init();
			require('./MapEngine/Skill').call();
			require('./MapEngine/ChatRoom').call();
			require('./MapEngine/Pet').call();
			require('./MapEngine/Homun').call();
			require('./MapEngine/Store').call();
			require('./MapEngine/Trade').call();
			require('./MapEngine/Friends').init();
			require('./MapEngine/UIOpen').call();
			require('./MapEngine/Quest').call();
			require('./MapEngine/Rodex').call();
			if(Configs.get('enableCashShop')){
				require('./MapEngine/CashShop').call();
			}

			if(Configs.get('enableBank')) {
				require('./MapEngine/Bank').init();
			}

			// Prepare UI
			Escape.prepare();
			Inventory.prepare();
			CartItems.prepare();
			Vending.prepare();
			ChangeCart.prepare();
			Equipment.getUI().prepare();
			ShortCuts.prepare();
			ShortCut.prepare();
			ChatRoomCreate.prepare();
			Emoticons.prepare();
			FPS.prepare();
			PartyFriends.prepare();
			StatusIcons.prepare();
			ChatBox.prepare();
			ChatBoxSettings.prepare();
			Guild.prepare();
			WorldMap.prepare();
			SkillListMER.prepare();
			Rodex.prepare();
			RodexIcon.prepare();
			if (UIVersionManager.getWinStatsVersion() === 0) {
				WinStats.prepare();
			}
			if(Configs.get('enableMapName')){
				MapName.prepare();
			}

			if(Configs.get('enableCashShop')){
				CashShop.prepare();
			}

			if(Configs.get('enableBank')) {
				Bank.prepare();
			}

			if(Configs.get('enableCheckAttendance') && PACKETVER.value >= 20180307) {
				CheckAttendance.prepare();
			}

			// Bind UI
			WinStats.onRequestUpdate        = onRequestStatUpdate;
			Equipment.getUI().onUnEquip             = onUnEquip;
			Equipment.getUI().onConfigUpdate        = onConfigUpdate;
			Equipment.getUI().onEquipItem           = onEquipItem;
			Equipment.getUI().onRemoveOption        = onRemoveOption;
			Inventory.onUseItem             = onUseItem;
			Inventory.onEquipItem           = onEquipItem;
			Escape.onExitRequest            = onExitRequest;
			Escape.onCharSelectionRequest   = onRestartRequest;
			Escape.onReturnSavePointRequest = onReturnSavePointRequest;
			Escape.onResurectionRequest     = onResurectionRequest;
			ChatBox.onRequestTalk           = onRequestTalk;

		}

		// Init selected UIs when needed
		if(MapEngine.needsUIVerUpdate || !_isInitialised){
			// Prepare UIs
			MiniMap.getUI().prepare();
			SkillList.getUI().prepare();
			BasicInfo.getUI().prepare();
			Equipment.getUI().prepare();
			Quest.getUI().prepare();

			// Bind UIs
			// nothing yet

			// Avoid zone server change init
			MapEngine.needsUIVerUpdate = false;
		}
	};


	/**
	 * Pong from server
	 * TODO: check the time ?
	 */
	function onPong( pkt )
	{
		//pkt.time
	}


	/**
	 * Server update our account id
	 *
	 * @param {object} pkt - PACKET.ZC.AID
	 */
	function onReceiveAccountID( pkt )
	{
		Session.Character.GID = pkt.AID;
	}


	/**
	 * Map accept us to enter the map
	 *
	 * @param {object} pkt - PACKET.ZC.ACCEPT_ENTER
	 */
	function onConnectionAccepted( pkt )
	{
		Session.Entity = new Entity( Session.Character );
		Session.Entity.onWalkEnd = onWalkEnd;

		if ('sex' in pkt && pkt.sex < 2) {
			Session.Entity.sex = pkt.sex;
		}

		// Reset
		Session.petId         =     0;
		Session.hasParty      = false;
		Session.isPartyLeader = false;
		Session.hasGuild      = false;
		Session.guildRight    =     0;

		Session.homunId       =     0;

		Session.Entity.clevel = Session.Character.level;

		BasicInfo.getUI().update('blvl', Session.Character.level );
		BasicInfo.getUI().update('jlvl', Session.Character.joblevel );
		BasicInfo.getUI().update('zeny', Session.Character.money );
		BasicInfo.getUI().update('name', Session.Character.name );
		BasicInfo.getUI().update('job',  Session.Character.job );

		// Fix http://forum.robrowser.com/?topic=32177.0
		onMapChange({
			xPos:    pkt.PosDir[0],
			yPos:    pkt.PosDir[1],
			mapName: _mapName
		});
	}


	/**
	 * Changing map, loading new map
	 *
	 * @param {object} pkt - PACKET.ZC.NPCACK_MAPMOVE
	 */
	function onMapChange( pkt )
	{
		jQuery(window).off('keydown.map');

		MapRenderer.onLoad = function(){

			// TODO: find a better place to put it
			jQuery(window).on('keydown.map', function( event ){
				if (event.which === KEYS.INSERT) {
					var pkt;
					if(PACKETVER.value >= 20180307) {
						pkt        = new PACKET.CZ.REQUEST_ACT2();
					} else {
						pkt        = new PACKET.CZ.REQUEST_ACT();
					}
					pkt.action = Session.Entity.action === Session.Entity.ACTION.SIT ? 3 : 2;
					Network.sendPacket(pkt);
					event.stopImmediatePropagation();
					return false;
				}
			});

			Session.Entity.set({
				PosDir: [ pkt.xPos, pkt.yPos, 0 ],
				GID: Session.Character.GID
			});
			EntityManager.add( Session.Entity );
			// free and load aura so it loads in new map
			Session.Entity.aura.free();
			Session.Entity.aura.load(EffectManager);

			// Initialize camera
			Camera.setTarget( Session.Entity );
			Camera.init();

			// Add Game UI
			MiniMap.getUI().append();
			MiniMap.getUI().setMap( MapRenderer.currentMap );
			if(Configs.get('enableMapName')){
				MapName.setMap( MapRenderer.currentMap );
				MapName.append();
			}
			ChatBox.append();
			ChatBoxSettings.append();
			BasicInfo.getUI().append();
			Escape.append();
			Inventory.append();
			CartItems.append();
			Vending.append();
			ChangeCart.append();
			Equipment.getUI().append();
			ShortCuts.append();
			StatusIcons.append();
			ShortCut.append();
			ChatRoomCreate.append();
			Emoticons.append();
			SkillList.getUI().append();
			FPS.append();
			PartyFriends.append();
			Guild.append();
			WorldMap.append();
			SkillListMER.append();
			MobileUI.append();
			if (UIVersionManager.getWinStatsVersion() === 0) {
				WinStats.append();
			}
			Quest.getUI().append();

			if(Configs.get('enableCashShop')){
				CashShop.append();
			}

			if(Configs.get('enableCheckAttendance') && PACKETVER.value >= 20180307) {
				CheckAttendance.append();
			}

			// Reload plugins
			PluginManager.init();

			// Map loaded
			Network.sendPacket(
				new PACKET.CZ.NOTIFY_ACTORINIT()
			);
		};

		MapRenderer.setMap( pkt.mapName );
	}


	/**
	 * Change zone server
	 *
	 * @param {object} pkt - PACKET.ZC.NPCACK_SERVERMOVE
	 */
	function onServerChange( pkt )
	{
		jQuery(window).off('keydown.map');
		MapEngine.init( pkt.addr.ip, pkt.addr.port, pkt.mapName );
	}


	/**
	 * Ask the server to disconnect
	 */
	function onExitRequest()
	{
		var pkt = new PACKET.CZ.REQUEST_QUIT();
		Network.sendPacket(pkt);

		// No Answer from the server, close it now
		UIManager.removeComponents();
		Network.close();
		Renderer.stop();
		MapRenderer.free();
		SoundManager.stop();
		BGM.stop();

		Background.remove(function(){
			window.close();
			require('Engine/GameEngine').init();
		});
	}


	/**
	 * Server don't want us to disconnect yet
	 *
	 * @param {object} pkt - PACKET.ZC.REFUSE_QUIT
	 */
	function onExitFail( pkt )
	{
		ChatBox.addText( DB.getMessage(502), ChatBox.TYPE.ERROR, ChatBox.FILTER.PUBLIC_LOG );
	}


	/**
	 * Server accept to disconnect us
	 *
	 * @param {object} pkt - PACKET.ZC.REFUSE_QUIT
	 */
	function onExitSuccess()
	{
		Renderer.stop();
		MapRenderer.free();

		UIManager.removeComponents();
		Network.close();
		Renderer.stop();
		MapRenderer.free();
		SoundManager.stop();
		BGM.stop();

		Background.remove(function(){
			window.close();
			require('Engine/GameEngine').init();
		});
	}


	/**
	 * Try to return to char-server
	 */
	function onRestartRequest()
	{
		var pkt = new PACKET.CZ.RESTART();
		pkt.type = 1;
		Network.sendPacket(pkt);
	}


	/**
	 * Go back to save point request
	 */
	function onReturnSavePointRequest()
	{
		var pkt = new PACKET.CZ.RESTART();
		pkt.type = 0;
		Network.sendPacket(pkt);
	}


	/**
	 * Resurection feature
	 */
	function onResurectionRequest()
	{
		var pkt = new PACKET.CZ.STANDING_RESURRECTION();
		Network.sendPacket(pkt);
	}


	/**
	 * Does the server want you to return to char-server ?
	 *
	 * @param {object} pkt - PACKET.ZC.RESTART_ACK
	 */
	function onRestartAnswer( pkt )
	{
		if (!pkt.type) {
			// Have to wait 10sec
			ChatBox.addText( DB.getMessage(502), ChatBox.TYPE.ERROR, ChatBox.FILTER.PUBLIC_LOG );
		}
		else {
			BasicInfo.getUI().remove();
			StatusIcons.clean();
			ChatBox.clean();
			ShortCut.clean();
			Quest.getUI().clean();
			PartyFriends.clean();
			MapRenderer.free();
			Renderer.stop();
			onRestart();
		}
	}


	/**
	 * Response from server to disconnect
	 * @param pkt - {object}
	 */
	function onDisconnectAnswer( pkt )
	{
		switch (pkt.result) {
			// Disconnect
			case 0:
				BasicInfo.getUI().remove();
				StatusIcons.clean();
				ChatBox.clean();
				ShortCut.clean();
				Quest.getUI().clean();
				PartyFriends.clean();
				Renderer.stop();
				onExitSuccess();
				break;

			case 1:
				// Have to wait 10 sec
				ChatBox.addText( DB.getMessage(502), ChatBox.TYPE.ERROR, ChatBox.FILTER.PUBLIC_LOG );
				break;

			default:
		}
	}


	/**
	 * ChatBox talk
	 *
	 * @param {string} user
	 * @param {string} text
	 * @param {number} target
	 */
	function onRequestTalk( user, text, target )
	{
		var pkt;
		var flag_party = text[0] === '%' || KEYS.CTRL;
		var flag_guild = text[0] === '$' || (KEYS.ALT && !(KEYS[0] || KEYS[1] || KEYS[2] || KEYS[3] || KEYS[4] || KEYS[5] || KEYS[6] || KEYS[7] || KEYS[8] || KEYS[9]));

		text = text.replace(/^(\$|\%)/, '');

		// Private messages
		if (user.length) {
			pkt          = new PACKET.CZ.WHISPER();
			pkt.receiver = user;
			pkt.msg      = text;
			Network.sendPacket(pkt);
			return;
		}

		// Set off/on flags
		if (flag_party) {
			target = (target & ~ChatBox.TYPE.PARTY) | (~target & ChatBox.TYPE.PARTY);
		}

		if (flag_guild) {
			target = (target & ~ChatBox.TYPE.GUILD) | (~target & ChatBox.TYPE.GUILD);
		}

		// Get packet
		if (target & ChatBox.TYPE.PARTY) {
			pkt = new PACKET.CZ.REQUEST_CHAT_PARTY();
		}
		else if (target & ChatBox.TYPE.GUILD) {
			pkt = new PACKET.CZ.GUILD_CHAT();
		}
		else {
			pkt = new PACKET.CZ.REQUEST_CHAT();
			chatLines++;
		}

		// send packet
		pkt.msg = Session.Entity.display.name + ' : ' + text;
		Network.sendPacket(pkt);

		//Super Novice Chant
		if(chatLines > 7 && ([ 23, 4045, 4128, 4172, 4190, 4191, 4192, 4193]).includes(Session.Entity._job)){
			if(Math.floor((BasicInfo.getUI().base_exp / BasicInfo.getUI().base_exp_next) * 1000.0) % 100 == 0){
				if(text == DB.getMessage(790)){
					snCounter = 1;
				} else if(snCounter == 1 && text == (DB.getMessage(791) + ' ' + Session.Entity.display.name + ' ' +DB.getMessage(792))){
					snCounter = 2;
				} else if(snCounter == 2 && text == DB.getMessage(793)){
					snCounter = 3;
				} else if (snCounter == 3){
					snCounter = 0;
					pkt = new PACKET.CZ.CHOPOKGI();
					Network.sendPacket(pkt);
				}else {
					snCounter = 0;
				}
			}
		}
	}


	/**
	 * Remove cart/peco/falcon
	 */
	function onRemoveOption()
	{
		var pkt = new PACKET.CZ.REQ_CARTOFF();
		Network.sendPacket(pkt);
	}


	/**
	 * @var {number} walk timer
	 */
	var _walkTimer = null;


	/**
	 * @var {number} Last delay to walk
	 */
	var _walkLastTick = 0;


	/**
	 * Ask to move
	 */
	function onRequestWalk()
	{
		Events.clearTimeout(_walkTimer);

		// If siting, update direction
		if (Session.Entity.action === Session.Entity.ACTION.SIT || KEYS.SHIFT) {
			Session.Entity.lookTo( Mouse.world.x, Mouse.world.y );

			var pkt;
			if(PACKETVER.value >= 20180307) {
				pkt = new PACKET.CZ.CHANGE_DIRECTION2();
			} else {
				pkt = new PACKET.CZ.CHANGE_DIRECTION();
			}
			pkt.headDir = Session.Entity.headDir;
			pkt.dir     = Session.Entity.direction;
			Network.sendPacket(pkt);
			return;
		}

		walkIntervalProcess();
	}


	/**
	 * Stop moving
	 */
	function onRequestStopWalk()
	{
		Events.clearTimeout(_walkTimer);
	}


	/**
	 * Moving function
	 */
	function walkIntervalProcess()
	{
		// setTimeout isn't accurate, so reduce the value
		// to avoid possible errors.
		if (_walkLastTick + 450 > Renderer.tick) {
			return;
		}

		var isWalkable   = (Mouse.world.x > -1 && Mouse.world.y > -1);
		var isCurrentPos = (Math.round(Session.Entity.position[0]) === Mouse.world.x &&
		                    Math.round(Session.Entity.position[1]) === Mouse.world.y);

		if (isWalkable && !isCurrentPos) {
			var pkt;
			if(PACKETVER.value >= 20180307) {
				pkt         = new PACKET.CZ.REQUEST_MOVE2();
			} else {
				pkt         = new PACKET.CZ.REQUEST_MOVE();
			}
			if (!checkFreeCell(Mouse.world.x, Mouse.world.y, 1, pkt.dest)) {
				pkt.dest[0] = Mouse.world.x;
				pkt.dest[1] = Mouse.world.y;
			}

			Network.sendPacket(pkt);
		}

		Events.clearTimeout(_walkTimer);
		_walkTimer    =  Events.setTimeout( walkIntervalProcess, 500);
		_walkLastTick = +Renderer.tick;
	}


	/**
	 * Search free cells around a position
	 *
	 * @param {number} x
	 * @param {number} y
	 * @param {number} range
	 * @param {array} out
	 */
	function checkFreeCell(x, y, range, out)
	{
		var _x, _y, r;
		var d_x = Session.Entity.position[0] < x ? -1 : 1;
		var d_y = Session.Entity.position[1] < y ? -1 : 1;

		// Search possible positions
		for (r = 0; r <= range; ++r) {
			for (_x = -r; _x <= r; ++_x) {
				for (_y = -r; _y <= r; ++_y) {
					if (isFreeCell(x + _x * d_x, y + _y * d_y)) {
						out[0] = x + _x * d_x;
						out[1] = y + _y * d_y;
						return true;
					}
				}
			}
		}

		return false;
	}


	/**
	 * Does a cell is free (walkable, and no entity on)
	 *
	 * @param {number} x
	 * @param {number} y
	 * @param {returns} is free
	 */
	function isFreeCell(x, y)
	{
		if (!(Altitude.getCellType(x, y) & Altitude.TYPE.WALKABLE)) {
			return false;
		}

		var free = true;

		EntityManager.forEach(function(entity){
			if (entity.objecttype != entity.constructor.TYPE_EFFECT &&
				entity.objecttype != entity.constructor.TYPE_UNIT &&
				entity.objecttype != entity.constructor.TYPE_TRAP &&
				Math.round(entity.position[0]) === x &&
				Math.round(entity.position[1]) === y) {
				free = false;
				return false;
			}

			return true;
		});

		return free;
	}


	/**
	 * If the character moved to attack, once it finished to move ask to attack
	 */
	function onWalkEnd()
	{
		// No action to do ?
		if (Session.moveAction) {
			// Not sure why, but there is a synchronization error with the
			// server when moving to attack (wrong position).
			// So wait 50ms to be sure we are at the correct position before
			// performing an action
			Events.setTimeout(function(){
				if (Session.moveAction) {
					Network.sendPacket(Session.moveAction);
					Session.moveAction = null;
				}
			}, 50);
		}
	}


	/**
	 * Ask server to update status
	 *
	 * @param {number} id
	 * @param {number} amount
	 */
	function onRequestStatUpdate(id, amount)
	{
		var pkt          = new PACKET.CZ.STATUS_CHANGE();
		pkt.statusID     = id;
		pkt.changeAmount = amount;

		Network.sendPacket(pkt);
	}


	/**
	 * Drop item to the floor
	 *
	 * @param {number} index in inventory
	 * @param {number} count to drop
	 */
	function onDropItem( index, count )
	{
		if (count) {
			if(PACKETVER.value >= 20180307) {
				var pkt   = new PACKET.CZ.ITEM_THROW2();
			} else {
				var pkt   = new PACKET.CZ.ITEM_THROW();
			}
			pkt.Index = index;
			pkt.count = count;
			Network.sendPacket(pkt);
		}
	}


	/**
	 * Use an item
	 *
	 * @param {number} item's index
	 */
	function onUseItem( index )
	{
		var pkt;
		if(PACKETVER.value >= 20180307) { // not sure - this date is when the shuffle packets stoped
			pkt = new PACKET.CZ.USE_ITEM2();
		} else {
			pkt = new PACKET.CZ.USE_ITEM();
		}
		pkt.index = index;
		pkt.AID   = Session.Entity.GID;
		Network.sendPacket(pkt);
	}


	/**
	 * Equip item
	 *
	 * @param {number} item's index
	 * @param {number} where to equip
	 */
	function onEquipItem( index, location )
	{
		var pkt          = new PACKET.CZ.REQ_WEAR_EQUIP();
		pkt.index        = index;
		pkt.wearLocation = location;
		Network.sendPacket(pkt);
	}


	/**
	 * Take off an equip
	 *
	 * @param {number} index to unequip
	 */
	function onUnEquip( index )
	{
		var pkt   = new PACKET.CZ.REQ_TAKEOFF_EQUIP();
		pkt.index = index;
		Network.sendPacket(pkt);
	}


	/**
	 * Update config
	 *
	 * @param {number} config id (only type:0 is supported - equip)
	 * @param {number} val
	 */
	function onConfigUpdate( type, val )
	{
		var pkt    = new PACKET.CZ.CONFIG();
		pkt.Config = type;
		pkt.Value  = val;
		Network.sendPacket(pkt);
	}


	/**
	 * Go back from map-server to char-server
	 */
	function onRestart()
	{
		require('Engine/CharEngine').reload();
	}


	/**
	 * Export
	 */
	return MapEngine;
});
