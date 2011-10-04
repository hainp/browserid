/*jshint browser:true, jQuery: true, forin: true, laxbreak:true */                                             
/*global setupChannel:true, BrowserID: true, PageController: true, OpenAjax: true */ 
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla BrowserID.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

//
// a JMVC controller for the browserid dialog
//

(function() {
"use strict";

PageController.extend("Dialog", {}, {
    init: function(el) {
      var html = $.View("//dialog/views/body.ejs", {});
      this.element.html(html);
      this.element.show();

      // keep track of where we are and what we do on success and error
      this.onsuccess = null;
      this.onerror = null;
      var chan = setupChannel(this);
      this.stateMachine();
    },
      
    getVerifiedEmail: function(origin_url, onsuccess, onerror) {
      this.onsuccess = onsuccess;
      this.onerror = onerror;

      BrowserID.Identities.setOrigin(origin_url);

      this.doStart();

      var self=this;
      $(window).bind("unload", function() {
        self.doCancel();
      });
    },


    stateMachine: function() {
      var self=this, 
          hub = OpenAjax.hub, 
          el = this.element;
     

      hub.subscribe("user_staged", function(msg, info) {
        self.doConfirmUser(info.email);
      });

      hub.subscribe("user_confirmed", function() {
        self.doUserConfirmed();
      });

      hub.subscribe("authenticated", function(msg, info) {
        //self.doEmailSelected(info.email);
        // XXX benadida, lloyd - swap these two if you want to experiment with 
        // generating assertions directly from signin.
        self.syncEmails();
      });

      hub.subscribe("reset_password", function(msg, info) {
        self.doConfirmUser(info.email);
      });

      hub.subscribe("assertion_generated", function(msg, info) {
        self.doAssertionGenerated(info.assertion);
      });

      hub.subscribe("email_staged", function(msg, info) {
        self.doConfirmEmail(info.email);
      });

      hub.subscribe("email_confirmed", function() {
        self.doEmailConfirmed();
      });

      hub.subscribe("notme", function() {
        self.doNotMe();
      });

      hub.subscribe("start", function() {
        self.doStart();
      });

      hub.subscribe("cancel", function() {
        self.doCancel();
      });

    },

    doConfirmUser: function(email) {
      this.confirmEmail = email;

      this.element.checkregistration({
        email: email,
        verifier: "waitForUserRegistration",
        verificationMessage: "user_confirmed"
      });
    },

    doUserConfirmed: function() {
      this.doEmailSelected(this.confirmEmail);
    },

    doStart: function() {
      // we should always check to see whether we're authenticated
      // at dialog start. issue #74.
      //
      // (lth) XXX: we could include both csrf token and auth status
      // in the intial resource serving to reduce network requests.
      this.doCheckAuth();
    },
      
    doCancel: function() {
      var self=this;
      if(self.onsuccess) {
        self.onsuccess(null);
      }
    },

    doSignIn: function() {
      this.element.pickemail();
    },

    doAuthenticate: function() {
      this.element.authenticate();
    },

    doCreate: function() {
      //this.element.createaccount();
    },
      
    doForgotPassword: function(email) {
      this.element.forgotpassword({
        email: email  
      });
    },

    doConfirmEmail: function(email) {
      this.confirmEmail = email;

      this.element.checkregistration({
        email: email,
        verifier: "waitForEmailRegistration",
        verificationMessage: "email_confirmed"
      });
    },

    doEmailConfirmed: function() {
      var self=this;
      // yay!  now we need to produce an assertion.
      BrowserID.Identities.getAssertion(this.confirmEmail, self.doAssertionGenerated.bind(self));
    },

    doAssertionGenerated: function(assertion) {
      var self=this;
      // Clear onerror before the call to onsuccess - the code to onsuccess 
      // calls window.close, which would trigger the onerror callback if we 
      // tried this afterwards.
      self.onerror = null;
      self.onsuccess(assertion);
    },

    doNotMe: function() {
      BrowserID.Identities.logoutUser(this.doAuthenticate.bind(this));
    },

    syncEmails: function() {
      var self = this;
      BrowserID.Identities.syncEmails(self.doSignIn.bind(self), 
        self.getErrorDialog(BrowserID.Errors.signIn));
    },


    doCheckAuth: function() {
      var self=this;
      self.doWait(BrowserID.Wait.checkAuth);
      BrowserID.Identities.checkAuthenticationAndSync(function onSuccess() {}, 
        function onComplete(authenticated) {
          if (authenticated) {
              self.doSignIn();
          } else {
            self.doAuthenticate();
          }
        }, 
        self.getErrorDialog(BrowserID.Errors.checkAuthentication));
  }

  });


}());
