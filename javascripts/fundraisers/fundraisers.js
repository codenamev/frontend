with (scope('Fundraisers','App')) {

  define('belongs_to', function(person) {
    return logged_in() && person && parseInt(person.id) == parseInt((Storage.get('access_token')||'').split('.')[0]);
  });

  define('get_href', function(fundraiser) {
    return pretty_url('#fundraisers/'+fundraiser.id+'-', fundraiser.title);
  });

  define('card', function(fundraiser) {
    fundraiser.description = fundraiser.short_description;
    return Home.fundraiser_card(fundraiser);
  });

  route('#account/fundraisers', function() {
    var fundraisers_table = div('Loading...');

    render(
      breadcrumbs(
        'Home',
        a({ href: '#account' }, 'Account'),
        'Fundraisers'
      ),
      fundraisers_table
    );

    BountySource.get_fundraisers(function(response) {
      if (response.data.length > 0) {
        render({ into: fundraisers_table },
          messages(),

          table(
            tr(
              th('Title'),
              th({ style: 'width: 130px;' }, 'Funding Goal'),
              th({ style: 'width: 200px;' }, 'Progress'),
              th({ style: 'width: 80px; text-align: center;' }, 'Status'),
              th({ style: 'width: 75px;' })
            ),
            response.data.map(function(fundraiser) {
              // depends on whether or not it's published
              return tr({ style: 'height: 40px;' },
                td(a({ href: fundraiser.url }, abbreviated_text(fundraiser.title, 100))),
                td(money(fundraiser.funding_goal || 0)),
                td(fundraiser.published && percentage((fundraiser.total_pledged / fundraiser.funding_goal) * 100)),
                td({ style: 'text-align: center;' }, fundraiser_published_status(fundraiser)),

                td({ style: 'text-align: center;' },
                  a({ href: '#account/fundraisers/'+fundraiser.id }, img({ src: 'images/edit.gif' })),

                  // TODO: info page for fundraiser author to see contributions and rewards that have been claimed
                  // a({ href: '#account/fundraisers/'+fundraiser.id+'/info', style: 'margin-left: 10px;' }, img({ src: 'images/info.gif' })),

                  a({ href: curry(destroy_fundraiser, fundraiser.id), style: 'margin-left: 10px; opacity:' + (fundraiser.published ? 0.25 : 1) + ';' }, img({ src: 'images/trash.gif' }))
                )
              );
            })
          )
        );
      } else {
        render({ into: fundraisers_table },
          info_message("You don't have any fundraiser drafts saved. ", a({ href: '#account/create_fundraiser' }, "Create one now"))
        );
      }
    });
  });

  define('fundraiser_published_status', function(fundraiser) {
    return span({ style: 'font-size; 16px;' },
      fundraiser.published ? span({ style: 'background: #83d11a; border-radius: 4px; padding: 4px; color: white' }, 'Published') : span({ style: 'background: #29A8DD; border-radius: 4px; padding: 4px; color: white' }, 'Draft')
    );
  });

  /*
  * Create a horizontal nav. Arguments are li elements.
  * */
  define('horizontal_nav', function() {
    var arguments = flatten_to_array(arguments),
        options   = shift_options_from_args(arguments),
        elements  = [];
    for (var i=0; i<arguments.length; i++) {
      var e = arguments[i];
      e.style.width = (100.0/arguments.length)+'%';
      elements.push(e);
    }
    options['class'] = 'horizontal-nav';
    return ul(options, elements);
  });

  define('fundraiser_form_nav', function() {
    for (var i=0; i<arguments.length; i++) arguments[i].className = arguments[i].className || 'fundraiser-form-nav';
    return horizontal_nav({ id: 'fundraiser-form-nav', style: 'border: 1px solid #D5D5D5; background: #EEE;' }, arguments);
  });

  route('#account/fundraisers/:fundraiser_id', function(fundraiser_id) {
    var target_div = div({ id: 'fundraiser-div' }, 'Loading...');

    render(
      breadcrumbs(
        a({ href: '#' }, 'Home'),
        a({ href: '#account' }, 'Account'),
        a({ href: '#account/fundraisers' }, 'Fundraisers'),
        span({ id: 'fundraiser-title' }, 'Loading...')
      ),
      target_div
    );

    BountySource.get_fundraiser(fundraiser_id, function(response) {
      if (!response.meta.success || !Fundraisers.belongs_to(response.data.person)) {
        render({ target: 'fundraiser-title' }, 'Not found');
        render({ into: target_div }, error_message(response.data.error || 'Fundraiser not found'));
      } else {
        var fundraiser = response.data;

        render({ target: 'fundraiser-title' }, abbreviated_text(fundraiser.title, 80));
        render({ into: target_div },
          div({ id: 'fundraiser-preview-wrapper', style: 'display: none;' },
            info_message(
              div({ style: 'font-size: 20px;' },
                span({ style: 'margin-right: 30px;' }, "This is what your fundraiser will look like once it is published."),
                a({ 'class': 'blue', style: 'width: 345px; display: inline-block;', href: hide_preview }, 'Back to Edit Page')
              )
            ),
            div({ id: 'fundraiser-preview' }, fundraiser_template(fundraiser, { preview: true }))
          ),

          div({ id: 'fundraiser-edit-form' },
            fundraiser_edit_form(fundraiser)
          )
        );

        populate_fundraiser_form_tables(fundraiser);
        select_fundraiser_form_section(fundraiser, 'basic-info');
        initialize_short_description_character_counter();

        // if any of the inputs are changed, set autosave.
        var elements_lists = [
          document.getElementsByTagName('input'),
          document.getElementsByTagName('textarea')
        ];
        for (var i=0; i<elements_lists.length; i++) {
          for (var j=0; j<elements_lists[i].length; j++) {
            elements_lists[i][j].addEventListener('keydown', function() {
              Fundraisers.save_necessary = true;
            });

            // save on blur of all inputs
            elements_lists[i][j].addEventListener('blur', function(e) {
              save_fundraiser(fundraiser);
            });
          }
        }

        // autosave poll
        LongPoll.execute(function() {
          if (Fundraisers.save_necessary) save_fundraiser(fundraiser, function() {
            // kill the success message for user triggered saves
            render({ into: 'fundraiser-edit-errors' }, '');
          });
        }).every(10000).start();
      }
    })
  });

  define('update_short_description_character_count', function(short_description_element, max) {
    max = max || 140;
    var char_count_element = document.getElementById('short-description-character-count');
    render({ into: char_count_element }, '('+short_description_element.value.length+'/'+max+')');
    char_count_element.style.color = (short_description_element.value.length > max) ? 'red' : 'green';
  });

  define('initialize_short_description_character_counter', function() {
    // character counter for short_description
    var short_description_element = document.getElementById('short-description');
    short_description_element.addEventListener('keyup', function(e) {
      update_short_description_character_count(e.target, 140);
    });
    update_short_description_character_count(short_description_element, 140);
  });

  // return a giant div containing fundraiser nav and form.
  define('fundraiser_edit_form', function(fundraiser) {
    var days_open_input = number({
      name:         'days_open',
      style:        'width: 50px;',
      placeholder:  fundraiser.min_days_open,
      value:        fundraiser.days_open || fundraiser.min_days_open,
      min:          fundraiser.min_days_open,
      max:          fundraiser.max_days_open
    });

    var end_by_date = new Date((new Date()).getTime() + 1000*60*60*24*parseInt(days_open_input.value));
    var end_by_date_element = span(formatted_date(end_by_date));

    days_open_input.addEventListener('change', function(e) {
      var end_by_date = new Date((new Date()).getTime() + 1000*60*60*24*parseInt(e.target.value));
      render({ into: end_by_date_element }, formatted_date(end_by_date));
    });

    return div(
      fundraiser_form_nav(
        li({ id: 'nav-basic-info', onclick: curry(select_fundraiser_form_section, fundraiser, 'basic-info') },
          'Basic Info'
        ),
        li({ id: 'nav-description', onclick: curry(select_fundraiser_form_section, fundraiser, 'description') },
          'Description'
        ),

// TODO bring back about me
//        li({ id: 'nav-about-me', onclick: curry(select_fundraiser_form_section, fundraiser, 'about-me') },
//          'About Me'
//        ),

        li({ id: 'nav-rewards', onclick: curry(select_fundraiser_form_section, fundraiser, 'rewards') },
          'Rewards'
        ),

        // don't show the funding goal edit field if published, since it cannot be updated.
        !fundraiser.published && li({ id: 'nav-funding-details', onclick: curry(select_fundraiser_form_section, fundraiser, 'funding-details') },
          'Funding'
        ),

        !fundraiser.published && li({ id: 'nav-duration', onclick: curry(select_fundraiser_form_section, fundraiser, 'duration') },
          'Duration'
        )
      ),

      div({ id: 'fundraiser-edit-errors', style: 'height: 40px;' }),

      div({ 'class': 'split-main' },
        form({ id: 'fundraiser-form', 'class': 'fancy', action: function(){} },
          fundraiser_block({ id: 'basic-info', title: 'Basic Information', description: "Provide some basic information about your proposal." },
            div({ style: 'padding: 20px 10px; background: #eee;' },
              fieldset(
                label('Title:'),
                input({ name: 'title', 'class': 'long', placeholder: 'My OSS Project', value: fundraiser.title||'', required: true })
              ),
              fieldset(
                label('Banner Image:'),
                input({ name: 'image_url', 'class': 'long', placeholder: 'http://i.imgur.com/abc123', value: fundraiser.image_url||'' })
              ),
              fieldset(
                label('Project Homepage:'),
                input({ name: 'homepage_url', 'class': 'long', placeholder: 'https://www.bountysource.com', value: fundraiser.homepage_url||'' })
              ),
              fieldset(
                label('Source Repository:'),
                input({ name: 'repo_url', 'class': 'long', placeholder: 'https://github.com/badger/frontend', value: fundraiser.repo_url||'' })
              ),
              fieldset(
                label('Short Description:', br(), span({ id: 'short-description-character-count', style: 'font-size: 80%;' })),
                textarea({ id: 'short-description', name: 'short_description', style: 'width: 392px; height: 150px; line-height: 18px;', placeholder: "Brief description of your fundraiser. Must be 140 characters or less." },
                  fundraiser.short_description || ''
                )
              )
            )
          ),

          fundraiser_block({ id: 'description', title: 'Description', description: div("Convince people to contribute. Why is your project interesting and worthy of funding? Formatted with ", a({ target: '_blank', href: 'http://github.github.com/github-flavored-markdown/' }, "GitHub Flavored Markdown.")) },
            div({ style: 'padding: 20px 10px; background: #eee;' },
              fieldset(
                textarea({ name: 'description', style: 'width: 630px; height: 600px; line-height: 18px;', placeholder: "Very thorough description of your fundraiser proposal." },
                  fundraiser.description || ''
                )
              )
            )
          ),

// TODO bring back about me
//          fundraiser_block({ id: 'about-me', title: 'About Me', description: "Convince people that you will be able to deliver." },
//            div({ style: 'padding: 20px 10px; background: #eee;' },
//              fieldset(
//                textarea({ name: 'about_me', style: 'width: 630px; height: 300px;', placeholder: "I am a Ruby on Rails engineer, with 8 years of experience." }, fundraiser.about_me||'')
//              )
//            )
//          ),

          fundraiser_block({ id: 'funding-details', title: 'Funding Details', description: "How much funding do you need to complete this project? How do you want to receive the funds?" },
            div({ style: 'padding: 20px 10px; background: #eee;' },
              fieldset(
                label('Funding Goal:'),
                span({ style: 'font-size: 30px; vertical-align: middle; padding-right: 5px;' }, '$'), number({ name: 'funding_goal', placeholder: '50,000', value: formatted_number(fundraiser.funding_goal||'') })
              ),
              fieldset(
                label('Payout Method:'),
                select({ name: 'payout_method', style: 'width: 400px;' },
                  option({ value: 'on_funding' },   'All upon funding goal being reached.'),
                  option({ value: 'fifty_fifty' },  'Half on funding goal being reached, half after delivery.'),
                  option({ value: 'on_delivery' },  'All upon delivery.')
                )
              )
            )
          ),

          fundraiser_block({ id: 'rewards', title: 'Rewards', description: "Thank your backers." },
            table({ id: 'rewards-table' },
              tr({ id: 'reward-inputs' },
                td(
                  div({ style: 'display: inline-block; vertical-align: middle' },
                    fieldset(
                      label('Amount:'),
                      span({ style: 'font-size: 25px; padding-right: 5px; vertical-align: middle;' }, '$'),
                      number({ id: 'reward-input-amount', style: 'width: 100px;', placeholder: 100 })
                    ),

                    fieldset(
                      label('Quantity:'),
                      number({ id: 'reward-input-quantity', placeholder: 'Unlimited', style: 'width: 100px; margin-left: 18px;' })
                    )
                  ),

                  textarea({
                    id:           'reward-input-description',
                    style:        'width: 200px; display: inline-block;',
                    placeholder:  'Description of the reward'
                  })
                ),

                td({ style: 'width: 100px;' },
                  a({ 'class': 'green', href: push_reward_row_from_inputs, style: 'width: 90px;' }, 'Add')
                )
              )
            )
          ),

          fundraiser_block({ id: 'duration', title: 'Duration', description: ("How long would you like your fundraiser to run? It can run between "+fundraiser.min_days_open+" and "+fundraiser.max_days_open+" days.") },
            div({ style: 'padding: 20px 10px; background: #eee;' },
              fieldset(
                label('Days Open:'),
                days_open_input
              ),

              fieldset(
                label('End Date:'),
                end_by_date_element
              )
            )
          )
        )
      ),

      div({ 'class': 'split-side' },
        // show message letting the author know that this fundraiser is published
        // fundraiser.published && info_message("Your fundraiser has been published, meaning that it is now public."),

        div({ style: 'text-align: left;' },
          h4({ style: 'margin: 0 0 0 0;' }, 'Card Preview'),
          p({ style: 'font-size: 12px' }, "This is how your fundraiser will be advertised on the home page. Click to preview full page:")
        ),

        // this is re-rendered after each save
        div({ onClick: curry(preview_fundraiser, fundraiser) },
          div({ id: 'fundraiser-card-preview' }, card(fundraiser))
        ),

        grey_box(
          !fundraiser.published && div(
            a({ 'class': 'green', 'href': curry(save_fundraiser_and_continue, fundraiser) }, 'Next')
          ),

          // if it's published, add a link to the show page, which saves any changes before changing pages.
          fundraiser.published && div(
            br(),

            a({ 'class': 'blue', href: function() {
              save_fundraiser(fundraiser, function() { set_route(fundraiser.url); })
            } }, 'Published Fundraiser')
          ),

          br(),

          a({ id: 'fundraiser-publish-button', 'class': 'blue', href: curry(publish_fundraiser, fundraiser) }, 'Publish'),

          (!fundraiser.published && !fundraiser.publishable) && p({ style: 'text-align: center; margin: 15px 0 0 0;' }, "You need to provide all of the necessary data to publish your fundraiser.")
        )
      ),

      div({ 'class': 'split-end' })
    );
  });

  define('populate_fundraiser_form_tables', function(fundraiser) {
    // render saved milestones into table
    var t = Teddy.snuggle('milestone-table');
    (fundraiser.milestones || []).forEach(function(milestone) {
      t.at('milestone-inputs').insert(milestone_row_elements(generate_milestone_row_id(), milestone));
    });

    // render saved rewards into table
    var t = Teddy.snuggle('rewards-table');
    (fundraiser.rewards || []).forEach(function(reward) {
      var row = t.at('reward-inputs').insert(reward_row_elements(generate_reward_row_id(), reward));
      if (fundraiser.published) add_class(row, 'published');
    });
  });

  /*
  * Show a part of the fundraiser edit form. Also, set the actions for next/previous buttons
  * */
  define('select_fundraiser_form_section', function(fundraiser, section_id) {
    save_fundraiser(fundraiser, function(response) {
      if (response.meta.success) {
        // Fake a page view for Analytics
        _gaq.push(['_trackPageview', '#account/fundraisers/' + fundraiser.id + '/' + section_id]);

        // show the right part of the form
        var elements = document.getElementsByClassName('fundraiser-block');
        for (var i=0; i<elements.length; i++) hide(elements[i]);
        show(section_id);

        // highlight the correct nav element
        var nav_elements    = document.getElementsByClassName('fundraiser-form-nav'),
          active_element  = document.getElementById('nav-'+section_id);
        for (var i=0; i<nav_elements.length; i++) remove_class(nav_elements[i], 'active');
        add_class(active_element, 'active');
      }
    });
  });

  // a pretty, formatted container for a set of inputs.
  // ARGUMENTS: options, *yield
  // yield                - what you want inside of the block
  // options.title        - the title of the block
  // options.description  - description of the inputs in the block
  define('fundraiser_block', function() {
    var arguments = flatten_to_array(arguments);
    var options   = shift_options_from_args(arguments);
    options['class'] = 'fundraiser-block';
    options['style'] = options['style'] || '#eee; border: 1px solid #ccc;';

    return div(options,
      div({ style: 'background: #F7F7F7; border-bottom: 1px solid #D5D5D5; padding: 20px 10px;' },
        span({ style: 'font-size: 25px;' }, options.title),
        div({ style: 'margin-left: 15px; padding-top: 10px; color: gray;' }, options.description)
      ),
      arguments
    );
  });

  define('publish_fundraiser', function(fundraiser) {
    if (confirm('Are you sure? Once published, you cannot change the funding goal or duration.')) {
      // first, save it. callback hell: population 2
      save_fundraiser(fundraiser, function(save_response) {
        // Fake a page view for Analytics
        _gaq.push(['_trackPageview', '#account/fundraisers/' + fundraiser.id + '/publish']);
        BountySource.publish_fundraiser(fundraiser.id, function(response) {
          if (response.meta.success) {
            set_route('#account/fundraisers');
          } else {
            render({ target: 'fundraiser-edit-errors' }, small_error_message(response.data.error));
          }
        });
      });
    }
  });

  // show the preview fundraiser
  define('preview_fundraiser', function(fundraiser) {
    save_fundraiser(fundraiser, function(response) {
      render({ target: 'fundraiser-preview' }, fundraiser_template(response.data, { preview: true }));
      hide('fundraiser-edit-form');
      show('fundraiser-preview-wrapper');
    });
  });

  define('hide_preview', function(){
    // clear the 'saved' message before coming back to edit form
    render({ target: 'fundraiser-edit-errors' },'');

    hide('fundraiser-preview-wrapper');
    show('fundraiser-edit-form');
  });

  define('save_fundraiser', function(fundraiser, callback) {
    // Fake a page view for Analytics
    _gaq.push(['_trackPageview', '#account/fundraisers/' + fundraiser.id + '/save']);

    // return if the form is not present
    if (!document.getElementById('fundraiser-form')) return;

    // collect form data from inputs
    var form_data = {
      title:              document.getElementsByName('title')[0].value,
      image_url:          document.getElementsByName('image_url')[0].value,
      homepage_url:       document.getElementsByName('homepage_url')[0].value,
      repo_url:           document.getElementsByName('repo_url')[0].value,
      description:        document.getElementsByName('description')[0].value,
      // about_me:           document.getElementsByName('about_me')[0].value,
      funding_goal:       parseInt(document.getElementsByName('funding_goal')[0].value || '0'),
      payout_method:      document.getElementsByName('payout_method')[0].value,
      short_description:  document.getElementsByName('short_description')[0].value,
      days_open:          parseInt(document.getElementsByName('days_open')[0].value || fundraiser.min_days_open)
    };

    // append serialized rewards array to request_data
    var t = Teddy.snuggle('rewards-table');
    form_data.rewards = [];
    t.forEach(function(row) {
      if (has_class(row, 'editable') && !row.getAttribute('locked-for-edit')) {
        var spans = row.getElementsByTagName('span');
        form_data.rewards.push({
          description:  spans[2].innerHTML,
          amount:       parseInt((spans[0].innerHTML).replace(/\$|\,/g,'')),
          limited_to:   parseInt(spans[1].innerHTML),
          id:           parseInt(row.getAttribute('data-id')) || null
        });
      }
    });
    form_data.rewards = JSON.stringify(form_data.rewards); // serialize array

    // clear error messages
    render({ target: 'fundraiser-edit-errors' },'');

    BountySource.update_fundraiser(fundraiser.id, form_data, function(response) {
      // show/hide the publish button
      (response.meta.success && response.data.publishable) ? show('fundraiser-publish-button') : hide('fundraiser-publish-button');

      if (response.meta.success) {
        // reset autosave flag
        Fundraisers.save_necessary = false;

        // render updated card preview
        render({ target: 'fundraiser-card-preview' }, card(response.data));
      } else {
        render({ target: 'fundraiser-edit-errors' }, small_error_message(response.data.error));
      }

      if (callback) callback(response);
    });
  });

  /*
  * Save the fundraiser draft, and move to the next section
  * */
  define('save_fundraiser_and_continue', function(fundraiser) {
    var active_nav_element = document.getElementsByClassName('fundraiser-form-nav active')[0];
    if (active_nav_element.nextSibling) {
      var next_nav_element_id = active_nav_element.nextSibling.id.split('-').slice(1).join('-');
      save_fundraiser(fundraiser, function() {
        select_fundraiser_form_section(fundraiser, next_nav_element_id);
      });
    } else {
      save_fundraiser(fundraiser);
    }
  });

  define('destroy_fundraiser', function(fundraiser_id) {
    if (confirm('Are you sure? It will be gone forever!')) {
      BountySource.destroy_fundraiser(fundraiser_id, function(response) {
        if (response.meta.success) {
          window.location.reload();
        } else {
          render({ target: 'fundraiser-edit-errors' }, error_message(response.data.error));
        }
      });
    }
  });
}
